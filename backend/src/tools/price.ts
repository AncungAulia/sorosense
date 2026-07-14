/**
 * Reflector price reads — a REAL on-chain SEP-40 oracle read (U1c). Backs the display-only FX of
 * `/earnings` + `/holdings` and the Sentinel's oracle-deviation signal.
 *
 * Reflector is a Soroban ORACLE CONTRACT, never a REST API. The previous implementation fetched
 * `GET https://reflector.stellar.org/price/{asset}` — a host that does not resolve — so every live FX
 * read failed and `/earnings` answered 503. We now simulate `lastprice(asset)` against the deployed
 * oracle and decode its `Option<PriceData>`.
 *
 * The SEP-40 shape, verified live on testnet against the default oracle below:
 *  - `base()` = `Other("USD")` — every price is quoted in USD, so a price IS that asset's USD rate.
 *  - `decimals()` = 14 — `price` is an i128 fixed-point: 1.1443 USD/EURC reads as `114433043263595`.
 *  - `lastprice(Asset) -> Option<PriceData { price: i128, timestamp: u64 }>`, where `Asset` is the Rust
 *    enum `Stellar(Address) | Other(Symbol)`. A variant with a payload encodes as the ScVec
 *    `[symbol(variant), payload]` — see {@link otherAsset}.
 *  - `assets()` on this feed lists crypto/stable symbols (USDC, EURC, XLM, …). There is NO fiat MXN,
 *    which is why the MXN bucket has no default symbol (`api/earnings.ts` `fxSymbolFor`).
 *
 * Injectable like `chain/event-reader.ts`: the transport is an {@link OracleSource} — the real one wraps
 * `rpc.Server.simulateTransaction` ({@link makeRpcOracleSource}), tests feed canned `ScVal`s through the
 * real decode path — so the suite stays offline and never touches the network.
 *
 * Network-backed → returns a typed {@link Result} and NEVER throws. An unconfigured oracle, an RPC
 * failure, `None`, or a malformed/non-positive price are all typed errors: the Sentinel treats them as
 * fail-closed (U8) and `/earnings` surfaces a non-200 — never a silent $0.
 */

import {
  Account,
  BASE_FEE,
  Contract,
  TransactionBuilder,
  contract,
  rpc,
  scValToNative,
  xdr,
} from '@stellar/stellar-sdk';

import { err, ok, type Result } from '../lib/result.js';

/** The SEP-40 oracle the FX rates are read from (testnet). `REFLECTOR_ORACLE_ID` overrides it. */
export const DEFAULT_REFLECTOR_ORACLE_ID = 'CCYOZJCOPG34LLQQ7N24YXBM7LL62R7ONMZ3G6WZAAYPB5OYKOMJRN63';

/** The feed's fixed-point scale — `decimals()` reads 14 on-chain. `REFLECTOR_DECIMALS` overrides it. */
export const DEFAULT_REFLECTOR_DECIMALS = 14;

export interface AssetPrice {
  asset: string;
  /** Price in the oracle's base currency (USD), already divided by the feed's 10^decimals scale. */
  price: number;
  /**
   * The oracle's own publish time for this price, in the unit the feed publishes it: EPOCH SECONDS on
   * the deployed testnet oracle (verified live — the value tracks the ledger close time). Kept raw
   * rather than normalized to the repo's epoch-ms convention, so a future staleness check converts from
   * a known unit instead of trusting a guess.
   */
  ts: number;
  source: 'reflector';
}

/**
 * The injected oracle transport. `simulate` runs a read-only contract call and hands back its return
 * `ScVal` (`undefined` when the simulation produced none). It may throw — {@link getReflectorPrice}
 * catches and types the failure, so no caller of this module ever needs a try/catch.
 */
export interface OracleSource {
  simulate(method: string, args: xdr.ScVal[]): Promise<xdr.ScVal | undefined>;
}

/** Config for the live source. Built from env by {@link oracleConfigFrom}. */
export interface RpcOracleSourceOptions {
  rpcUrl: string;
  oracleId: string;
  networkPassphrase: string;
}

/** Options for a price read. `source` is what tests inject to stay offline. */
export interface ReflectorOptions {
  /** Transport override. Default: the live RPC source built from `env`. */
  source?: OracleSource;
  /** Fixed-point scale override. Default: `REFLECTOR_DECIMALS`, else 14. */
  decimals?: number;
  /** Env override (read at call time, so a late `.env` load still takes effect). */
  env?: NodeJS.ProcessEnv;
}

/**
 * `Asset::Other(Symbol)` as an `ScVal`. A Rust enum variant carrying a payload encodes as an ScVec of
 * `[symbol(variantName), ...payload]` — so `Other("EURC")` is `["Other", "EURC"]`, both symbols.
 * (`Stellar(Address)` is the other variant; this feed prices its assets by symbol, so we never need it.)
 */
export function otherAsset(symbol: string): xdr.ScVal {
  return xdr.ScVal.scvVec([xdr.ScVal.scvSymbol('Other'), xdr.ScVal.scvSymbol(symbol)]);
}

/** The live oracle config, or `null` when the network env is absent (mock mode never reads a price). */
export function oracleConfigFrom(env: NodeJS.ProcessEnv = process.env): RpcOracleSourceOptions | null {
  const rpcUrl = env.STELLAR_RPC_URL;
  const networkPassphrase = env.STELLAR_NETWORK_PASSPHRASE;
  if (!rpcUrl || !networkPassphrase) return null;
  return {
    rpcUrl,
    networkPassphrase,
    oracleId: env.REFLECTOR_ORACLE_ID || DEFAULT_REFLECTOR_ORACLE_ID,
  };
}

/** The feed's fixed-point scale from env, falling back to the on-chain value (14). */
export function reflectorDecimals(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.REFLECTOR_DECIMALS;
  if (!raw) return DEFAULT_REFLECTOR_DECIMALS;
  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : DEFAULT_REFLECTOR_DECIMALS;
}

/**
 * Latest oracle price for `asset` (a feed symbol such as `EURC`), quoted in the oracle's USD base.
 *
 * Every failure path is a typed error, never a throw: no oracle configured (`unavailable`), an RPC or
 * simulation failure (`unavailable`), `Option::None` — the feed does not carry this symbol
 * (`not_found`), or an unreadable/non-positive price (`parse`). A zero price is rejected rather than
 * returned, because a rate of 0 would blend a real balance to a silent $0.
 */
export async function getReflectorPrice(
  asset: string,
  options: ReflectorOptions = {},
): Promise<Result<AssetPrice>> {
  const env = options.env ?? process.env;

  let source = options.source;
  if (!source) {
    const config = oracleConfigFrom(env);
    if (!config) {
      return err('unavailable', 'reflector oracle not configured (STELLAR_RPC_URL / _PASSPHRASE)');
    }
    source = makeRpcOracleSource(config);
  }

  let retval: xdr.ScVal | undefined;
  try {
    retval = await source.simulate('lastprice', [otherAsset(asset)]);
  } catch (cause) {
    return err('unavailable', `reflector lastprice(${asset}) failed: ${describe(cause)}`);
  }

  return decodePrice(asset, retval, options.decimals ?? reflectorDecimals(env));
}

/**
 * Decode `Option<PriceData>` into an {@link AssetPrice}. Pure — same ScVal in, same Result out — which is
 * what lets the offline suite exercise the real decode path with canned values.
 *
 * `Option::None` decodes to `null` (an ScVal void); `Some(PriceData)` decodes to a record of the struct's
 * fields, `price` as a `bigint` (i128) and `timestamp` as a `bigint` (u64).
 */
function decodePrice(asset: string, retval: xdr.ScVal | undefined, decimals: number): Result<AssetPrice> {
  if (retval === undefined) return err('unavailable', `reflector returned nothing for ${asset}`);

  let native: unknown;
  try {
    native = scValToNative(retval);
  } catch (cause) {
    return err('parse', `reflector price for ${asset} is not decodable: ${describe(cause)}`);
  }

  if (native === null || native === undefined) {
    return err('not_found', `reflector has no price for ${asset}`); // Option::None — an unlisted symbol
  }
  if (typeof native !== 'object' || Array.isArray(native)) {
    return err('parse', `reflector price for ${asset} is not a PriceData struct`);
  }

  const { price: raw, timestamp } = native as { price?: unknown; timestamp?: unknown };
  if (typeof raw !== 'bigint' && typeof raw !== 'number') {
    return err('parse', `reflector price for ${asset} has no numeric price field`);
  }

  const price = Number(raw) / 10 ** decimals;
  // Fail closed on a broken feed: 0/NaN would silently blend real money to $0 (R6).
  if (!Number.isFinite(price) || price <= 0) {
    return err('parse', `reflector price for ${asset} is not a positive number (${String(raw)})`);
  }

  const ts = typeof timestamp === 'bigint' || typeof timestamp === 'number' ? Number(timestamp) : 0;
  return ok({ asset, price, ts, source: 'reflector' });
}

/** Message of an unknown thrown value — never rethrown, only described in a typed error. */
const describe = (cause: unknown): string => (cause instanceof Error ? cause.message : String(cause));

/**
 * The production {@link OracleSource}: simulate a read-only call on the oracle over Stellar RPC. Not
 * exercised in CI (the suite injects a fake), so it stays deliberately thin — the decode it feeds is
 * what carries the logic.
 *
 * The source account is the SDK's null account: a simulation is neither signed nor submitted, so no real
 * account (and no extra `getAccount` round trip) is needed to read a price.
 */
export function makeRpcOracleSource(options: RpcOracleSourceOptions): OracleSource {
  const server = new rpc.Server(options.rpcUrl);
  const oracle = new Contract(options.oracleId);

  return {
    async simulate(method: string, args: xdr.ScVal[]): Promise<xdr.ScVal | undefined> {
      const tx = new TransactionBuilder(new Account(contract.NULL_ACCOUNT, '0'), {
        fee: BASE_FEE,
        networkPassphrase: options.networkPassphrase,
      })
        .addOperation(oracle.call(method, ...args))
        .setTimeout(30)
        .build();

      const sim = await server.simulateTransaction(tx);
      if (rpc.Api.isSimulationError(sim)) {
        throw new Error(`${method} simulation failed: ${sim.error}`);
      }
      return sim.result?.retval;
    },
  };
}
