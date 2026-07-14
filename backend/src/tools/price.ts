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

import { err, ok, type Err, type Result } from '../lib/result.js';

/** The SEP-40 oracle the FX rates are read from (testnet). `REFLECTOR_ORACLE_ID` overrides it. */
export const DEFAULT_REFLECTOR_ORACLE_ID = 'CCYOZJCOPG34LLQQ7N24YXBM7LL62R7ONMZ3G6WZAAYPB5OYKOMJRN63';

/** The feed's fixed-point scale — `decimals()` reads 14 on-chain. `REFLECTOR_DECIMALS` overrides it. */
export const DEFAULT_REFLECTOR_DECIMALS = 14;

/** Mirrors `lib/http.ts` — a stalled RPC must not hang the read forever (it becomes `err('timeout')`). */
const DEFAULT_TIMEOUT_MS = 8_000;

/** Thrown by an {@link OracleSource} that gave up waiting; mapped to `err('timeout')` (HTTP 504). */
export class OracleTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OracleTimeoutError';
  }
}

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
  /** Per-call ceiling; a stalled RPC becomes `err('timeout')` instead of hanging the request. */
  timeoutMs?: number;
}

/** Options for a price read. `source` is what tests inject to stay offline. */
export interface ReflectorOptions {
  /** Transport override. Default: the live RPC source built from `env`. */
  source?: OracleSource;
  /** Fixed-point scale override. Default: `REFLECTOR_DECIMALS`, else the oracle's own `decimals()`. */
  decimals?: number;
  /** Per-call ceiling for an oracle read (ms). Default 8000, matching `lib/http.ts`. */
  timeoutMs?: number;
  /** Env override (read at call time, so a late `.env` load still takes effect). */
  env?: NodeJS.ProcessEnv;
}

/** Reads one asset's price off a single feed. Built by {@link makeReflectorReader}. */
export type ReflectorReader = (asset: string) => Promise<Result<AssetPrice>>;

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

/**
 * The fixed-point scale PINNED by config, or `undefined` when nothing pins it — in which case the scale
 * is read from the oracle itself (see {@link makeReflectorReader}). Pinning is the escape hatch, not the
 * default: `REFLECTOR_ORACLE_ID` and `REFLECTOR_DECIMALS` describe the same feed, so a repointed oracle
 * with a stale pinned scale would multiply every rate by a power of ten — and a 10,000× rate is not a
 * crash, it is a €100 bucket rendered as $1,144,330. Asking the feed keeps the two in step by default.
 */
export function reflectorDecimals(env: NodeJS.ProcessEnv = process.env): number | undefined {
  const raw = env.REFLECTOR_DECIMALS;
  if (!raw) return undefined;
  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

/**
 * A reader bound to ONE feed. It builds the transport once and remembers the feed's scale, so a live
 * `/earnings` does not construct an RPC client — or re-read `decimals()` — per bucket per request. This
 * is what `makeReflectorFx` holds for the process; {@link getReflectorPrice} is the one-shot convenience.
 *
 * Every failure is a typed error, never a throw — including the two that hide in *construction*:
 * `new rpc.Server(url)` rejects a plain-`http://` URL and `new Contract(id)` rejects a malformed strkey,
 * and those are exactly the `.env`-editable knobs we advertise. Escaping as a throw would turn a typo
 * into an unshaped HTTP 500 instead of the fail-closed 503 the read surfaces promise.
 */
export function makeReflectorReader(options: ReflectorOptions = {}): ReflectorReader {
  let source: OracleSource | undefined = options.source;
  let decimals: number | undefined;

  return async (asset: string): Promise<Result<AssetPrice>> => {
    const env = options.env ?? process.env;

    if (!source) {
      const config = oracleConfigFrom(env);
      if (!config) {
        return err('unavailable', 'reflector oracle not configured (STELLAR_RPC_URL / _PASSPHRASE)');
      }
      try {
        source = makeRpcOracleSource({ ...config, timeoutMs: options.timeoutMs });
      } catch (cause) {
        return err('unavailable', `reflector oracle is misconfigured: ${describe(cause)}`);
      }
    }

    if (decimals === undefined) {
      const scale = await readDecimals(source, options.decimals ?? reflectorDecimals(env));
      if (!scale.ok) return scale;
      decimals = scale.value;
    }

    let retval: xdr.ScVal | undefined;
    try {
      retval = await source.simulate('lastprice', [otherAsset(asset)]);
    } catch (cause) {
      return failure(`reflector lastprice(${asset})`, cause);
    }

    return decodePrice(asset, retval, decimals);
  };
}

/**
 * Latest oracle price for `asset` (a feed symbol such as `EURC`), quoted in the oracle's USD base. A
 * one-shot read: it builds a reader per call, so a caller reading repeatedly should hold a
 * {@link makeReflectorReader} instead (`makeReflectorFx` does).
 *
 * Never throws. `unavailable` = unconfigured/misconfigured oracle or a failed RPC; `timeout` = the feed
 * did not answer in time; `not_found` = `Option::None`, the feed does not carry this symbol; `parse` =
 * an unreadable or non-positive price (a rate of 0 would blend a real balance to a silent $0).
 */
export async function getReflectorPrice(
  asset: string,
  options: ReflectorOptions = {},
): Promise<Result<AssetPrice>> {
  return makeReflectorReader(options)(asset);
}

/** The feed's scale: the pinned value when config supplies one, else the oracle's own `decimals()`. */
async function readDecimals(source: OracleSource, pinned: number | undefined): Promise<Result<number>> {
  if (pinned !== undefined) return ok(pinned);

  let retval: xdr.ScVal | undefined;
  try {
    retval = await source.simulate('decimals', []);
  } catch (cause) {
    return failure('reflector decimals()', cause);
  }

  const native = retval === undefined ? undefined : scValToNative(retval);
  if (typeof native !== 'number' || !Number.isInteger(native) || native < 0) {
    return err('parse', `reflector decimals() is not a u32 (${String(native)})`);
  }
  return ok(native);
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

/** A thrown transport failure as a typed error: a stall is `timeout` (504), anything else `unavailable`. */
const failure = (what: string, cause: unknown): Err =>
  cause instanceof OracleTimeoutError
    ? err('timeout', `${what} timed out`)
    : err('unavailable', `${what} failed: ${describe(cause)}`);

/**
 * Bound `work` by `ms`. The SDK's RPC client has NO timeout of its own (axios defaults to none), so
 * without this a stalled oracle would hang `/earnings` forever — the previous REST reader had an 8s
 * abort, and losing it silently would be a regression.
 */
async function withTimeout<T>(work: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stall = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new OracleTimeoutError(`${what} timed out after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([work, stall]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The production {@link OracleSource}: simulate a read-only call on the oracle over Stellar RPC. Not
 * exercised in CI (the suite injects a fake), so it stays deliberately thin — the decode it feeds is
 * what carries the logic.
 *
 * The source account is the SDK's null account: a simulation is neither signed nor submitted, so no real
 * account (and no extra `getAccount` round trip) is needed to read a price.
 */
export function makeRpcOracleSource(options: RpcOracleSourceOptions): OracleSource {
  // Both constructors throw on bad config (an `http://` URL; a malformed contract id) — the caller
  // builds this inside a try and types the failure. Nothing here signs or submits: a read is a simulation.
  const server = new rpc.Server(options.rpcUrl);
  const oracle = new Contract(options.oracleId);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return {
    async simulate(method: string, args: xdr.ScVal[]): Promise<xdr.ScVal | undefined> {
      const tx = new TransactionBuilder(new Account(contract.NULL_ACCOUNT, '0'), {
        fee: BASE_FEE,
        networkPassphrase: options.networkPassphrase,
      })
        .addOperation(oracle.call(method, ...args))
        .setTimeout(30)
        .build();

      const sim = await withTimeout(server.simulateTransaction(tx), timeoutMs, `reflector ${method}`);
      if (rpc.Api.isSimulationError(sim)) {
        throw new Error(`${method} simulation failed: ${sim.error}`);
      }
      return sim.result?.retval;
    },
  };
}
