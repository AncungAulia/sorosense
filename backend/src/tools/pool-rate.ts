/**
 * Pool-rate reads — a REAL on-chain read of a `yield_pool`'s annual rate (U4), the number the app
 * quotes as the display APY instead of a hardcoded catalog constant. This is what makes the money
 * path's headline figure *true*: it is the pool's own `rate_bps()`, read off the ledger, not `8.59`
 * typed into a source file.
 *
 * A `yield_pool` exposes `rate_bps() -> u32` (`1000` = 10.00%); the APY is simply `rate_bps / 100`.
 * There is deliberately NO vault call for this — a pool's rate is not a vault operation, so it is read
 * through its own reader (the way FX is), never bolted onto the vault seam.
 *
 * Mirrors `tools/price.ts` line for line in posture (KTD7): an injectable {@link PoolSource} (the real
 * one wraps `rpc.Server.simulateTransaction` on the pool's `rate_bps`, built once per reader with an 8s
 * timeout — the SDK's RPC client has none), a typed {@link Result}, and fail-closed on everything
 * including construction. Tests feed a canned `rate_bps` `ScVal` through the real decode path, so the
 * suite never touches the network.
 *
 * Network-backed → returns a typed {@link Result} and NEVER throws. An unconfigured pool, an RPC
 * failure, or a malformed/zero rate are all typed errors — a 0% quote is a lie, not a degraded read, so
 * it fails `parse` rather than rendering as truth. The read surfaces map a failure to a shaped non-200,
 * never a stale constant.
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

/** Mirrors `tools/price.ts` — a stalled RPC must not hang the read forever (becomes `err('timeout')`). */
const DEFAULT_TIMEOUT_MS = 8_000;

/** Thrown by a {@link PoolSource} that gave up waiting; mapped to `err('timeout')` (HTTP 504). */
export class PoolRateTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PoolRateTimeoutError';
  }
}

/**
 * The injected pool transport. `simulate` runs a read-only contract call and hands back its return
 * `ScVal` (`undefined` when the simulation produced none). It may throw — {@link makePoolRateReader}
 * catches and types the failure, so no caller of this module ever needs a try/catch.
 */
export interface PoolSource {
  simulate(method: string, args: xdr.ScVal[]): Promise<xdr.ScVal | undefined>;
}

/** Config for the live source. Built from env by {@link poolSourceConfigFrom}. */
export interface RpcPoolSourceOptions {
  rpcUrl: string;
  poolId: string;
  networkPassphrase: string;
  /** Per-call ceiling; a stalled RPC becomes `err('timeout')` instead of hanging the request. */
  timeoutMs?: number;
}

/** Options for a pool-rate read. `source` is what tests inject to stay offline. */
export interface PoolRateOptions {
  /** Transport override. Default: the live RPC source built from `poolId` + `env`. */
  source?: PoolSource;
  /** Per-call ceiling (ms). Default 8000, matching `tools/price.ts`. */
  timeoutMs?: number;
  /** Env override (read at call time, so a late `.env` load still takes effect). */
  env?: NodeJS.ProcessEnv;
}

/** Reads its bound pool's APY (percent). Built by {@link makePoolRateReader}. */
export type PoolRateReader = () => Promise<Result<number>>;

/** The live RPC config, or `null` when the network env is absent (mock mode never reads a rate). */
export function poolSourceConfigFrom(
  poolId: string,
  env: NodeJS.ProcessEnv = process.env,
): RpcPoolSourceOptions | null {
  const rpcUrl = env.STELLAR_RPC_URL;
  const networkPassphrase = env.STELLAR_NETWORK_PASSPHRASE;
  if (!rpcUrl || !networkPassphrase || !poolId) return null;
  return { rpcUrl, networkPassphrase, poolId };
}

/**
 * A reader that builds the transport once (per pool address) and returns the pool's APY as a percent.
 * Every failure is a typed error, never a throw — including the two that hide in *construction*:
 * `new rpc.Server(url)` rejects a plain-`http://` URL and `new Contract(id)` rejects a malformed strkey,
 * and those are exactly the `.env`-editable knobs we advertise. Escaping as a throw would turn a typo
 * into an unshaped HTTP 500 instead of the fail-closed 503 the read surfaces promise.
 *
 * The reader is bound to ONE pool address (the transport carries its `Contract`); a process reading
 * several pools holds one reader per pool.
 */
export function makePoolRateReader(poolAddress: string, options: PoolRateOptions = {}): PoolRateReader {
  let source: PoolSource | undefined = options.source;

  return async (): Promise<Result<number>> => {
    const env = options.env ?? process.env;

    if (!source) {
      const config = poolSourceConfigFrom(poolAddress, env);
      if (!config) {
        return err('unavailable', 'yield pool not configured (STELLAR_RPC_URL / _PASSPHRASE / pool id)');
      }
      try {
        source = makeRpcPoolSource({ ...config, timeoutMs: options.timeoutMs });
      } catch (cause) {
        return err('unavailable', `yield pool is misconfigured: ${describe(cause)}`);
      }
    }

    let retval: xdr.ScVal | undefined;
    try {
      retval = await source.simulate('rate_bps', []);
    } catch (cause) {
      return failure(`yield pool rate_bps(${poolAddress})`, cause);
    }

    return decodeRate(poolAddress, retval);
  };
}

/**
 * One-shot APY read for a pool address. Builds a reader per call, so a caller reading repeatedly should
 * hold a {@link makePoolRateReader} instead. Never throws; see the module doc for the error taxonomy.
 */
export async function getPoolApy(poolAddress: string, options: PoolRateOptions = {}): Promise<Result<number>> {
  return makePoolRateReader(poolAddress, options)();
}

/**
 * Decode a `rate_bps` `ScVal` (a `u32`) into an APY percent. Pure — same ScVal in, same Result out —
 * which is what lets the offline suite exercise the real decode path with a canned value. A zero or
 * unreadable rate is `parse`: a 0% APY is not a degraded read, it is a false headline.
 */
export function decodeRate(poolAddress: string, retval: xdr.ScVal | undefined): Result<number> {
  if (retval === undefined) return err('unavailable', `yield pool returned nothing for ${poolAddress}`);

  let native: unknown;
  try {
    native = scValToNative(retval);
  } catch (cause) {
    return err('parse', `yield pool rate for ${poolAddress} is not decodable: ${describe(cause)}`);
  }

  const bps = typeof native === 'bigint' || typeof native === 'number' ? Number(native) : NaN;
  if (!Number.isFinite(bps) || !Number.isInteger(bps) || bps <= 0) {
    return err('parse', `yield pool rate for ${poolAddress} is not a positive bps u32 (${String(native)})`);
  }
  return ok(bps / 100); // 1000 bps → 10.00%
}

/** Message of an unknown thrown value — never rethrown, only described in a typed error. */
const describe = (cause: unknown): string => (cause instanceof Error ? cause.message : String(cause));

/** A thrown transport failure as a typed error: a stall is `timeout` (504), anything else `unavailable`. */
const failure = (what: string, cause: unknown): Result<number> =>
  cause instanceof PoolRateTimeoutError
    ? err('timeout', `${what} timed out`)
    : err('unavailable', `${what} failed: ${describe(cause)}`);

/**
 * Bound `work` by `ms`. The SDK's RPC client has NO timeout of its own, so without this a stalled pool
 * would hang the read forever (same rationale as `tools/price.ts`).
 */
async function withTimeout<T>(work: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stall = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new PoolRateTimeoutError(`${what} timed out after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([work, stall]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The production {@link PoolSource}: simulate a read-only `rate_bps` call on the pool over Stellar RPC.
 * Not exercised in CI (the suite injects a fake), so it stays deliberately thin. The source account is
 * the SDK's null account — a simulation is neither signed nor submitted.
 */
export function makeRpcPoolSource(options: RpcPoolSourceOptions): PoolSource {
  // Both constructors throw on bad config (an `http://` URL; a malformed contract id) — the caller
  // builds this inside a try and types the failure. Nothing here signs or submits: a read is a simulation.
  const server = new rpc.Server(options.rpcUrl);
  const pool = new Contract(options.poolId);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return {
    async simulate(method: string, args: xdr.ScVal[]): Promise<xdr.ScVal | undefined> {
      const tx = new TransactionBuilder(new Account(contract.NULL_ACCOUNT, '0'), {
        fee: BASE_FEE,
        networkPassphrase: options.networkPassphrase,
      })
        .addOperation(pool.call(method, ...args))
        .setTimeout(30)
        .build();

      const sim = await withTimeout(server.simulateTransaction(tx), timeoutMs, `yield pool ${method}`);
      if (rpc.Api.isSimulationError(sim)) {
        throw new Error(`${method} simulation failed: ${sim.error}`);
      }
      return sim.result?.retval;
    },
  };
}
