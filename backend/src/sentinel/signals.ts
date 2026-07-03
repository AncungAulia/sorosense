/**
 * Sentinel risk signals — pure, deterministic rules (KTD6). No LLM, no randomness.
 *
 * Two signals mirror the YieldBlox failure mode (Feb 2026): thin liquidity relative to the position,
 * and an oracle price that deviates from its own TWAP. Missing inputs are NOT ignored — they are
 * treated as maximal risk (fail-closed), so a broken feed can never look "safe".
 */

/** Raw inputs for one pool at one tick. `null` means the read was missing/stale/errored. */
export interface PoolSignalInput {
  poolId: string;
  /** Total pool liquidity in USD (reserves). `null` if the read failed. */
  liquidityUsd: number | null;
  /** The position size we would hold / do hold in USD. */
  positionUsd: number;
  /** Oracle time-weighted average price. `null` if the read failed. */
  oracleTwap: number | null;
  /** Oracle latest/spot price. `null` if the read failed. */
  oracleSpot: number | null;
}

export interface SignalThresholds {
  /** Position/liquidity ratio at/above which liquidity is "thin". Default 5%. */
  thinLiquidityRatio: number;
  /** |spot-twap|/twap at/above which the oracle is "deviating". Default 1%. */
  oracleDeviationPct: number;
}

export const DEFAULT_THRESHOLDS: SignalThresholds = {
  thinLiquidityRatio: 0.05,
  oracleDeviationPct: 0.01,
};

/** A single signal's verdict. `missing` marks a fail-closed input. */
export interface Signal {
  /** 0..1 risk contribution (1 = maximal). */
  value: number;
  /** True when the signal crosses its threshold. */
  tripped: boolean;
  /** True when the underlying read was missing/stale (fail-closed to maximal risk). */
  missing: boolean;
}

const isBad = (n: number | null): n is null => n === null || Number.isNaN(n);

/** Liquidity signal: the larger the position relative to pool liquidity, the riskier. */
export function liquiditySignal(
  input: PoolSignalInput,
  t: SignalThresholds = DEFAULT_THRESHOLDS,
): Signal {
  if (isBad(input.liquidityUsd) || input.liquidityUsd <= 0) {
    return { value: 1, tripped: true, missing: true };
  }
  const ratio = input.positionUsd / input.liquidityUsd;
  const value = Math.min(1, ratio / (t.thinLiquidityRatio * 4)); // saturates at 4x the threshold
  return { value, tripped: ratio >= t.thinLiquidityRatio, missing: false };
}

/** Oracle-deviation signal: spot drifting from TWAP is the manipulated-feed shape. */
export function oracleDeviationSignal(
  input: PoolSignalInput,
  t: SignalThresholds = DEFAULT_THRESHOLDS,
): Signal {
  if (isBad(input.oracleTwap) || isBad(input.oracleSpot) || input.oracleTwap <= 0) {
    return { value: 1, tripped: true, missing: true };
  }
  const deviation = Math.abs(input.oracleSpot - input.oracleTwap) / input.oracleTwap;
  const value = Math.min(1, deviation / (t.oracleDeviationPct * 4));
  return { value, tripped: deviation >= t.oracleDeviationPct, missing: false };
}
