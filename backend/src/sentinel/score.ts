/**
 * Sentinel scoring — composes the raw signals into a 0-100 internal risk score and an `anomaly`
 * flag the freeze path (U10) acts on. The score classifies pools into the Safe set the allocator
 * (U9) draws from; it is INTERNAL and never surfaced to the user (R11). Deterministic for fixed
 * inputs — the LLM only narrates, it never decides here (KTD6).
 */

import {
  DEFAULT_THRESHOLDS,
  liquiditySignal,
  oracleDeviationSignal,
  type PoolSignalInput,
  type SignalThresholds,
} from './signals.js';

export interface RiskAssessment {
  poolId: string;
  /** 0 (safe) .. 100 (toxic). Internal only. */
  score: number;
  /** True when the pool should be frozen / kept out of the Safe set. */
  anomaly: boolean;
  /** Whether the pool is in the Safe set the allocator may use. */
  safe: boolean;
  /** Human-readable reasons (for activity narration, not a user risk label). */
  reasons: string[];
}

/** Score at/above which a pool is excluded from the Safe set. */
export const SAFE_SCORE_CEILING = 50;

/**
 * Assess one pool. Fail-closed: any missing signal forces an anomaly at score 100. The YieldBlox
 * shape (thin liquidity AND oracle deviation both tripped) is always an anomaly.
 */
export function scorePool(
  input: PoolSignalInput,
  thresholds: SignalThresholds = DEFAULT_THRESHOLDS,
): RiskAssessment {
  const liq = liquiditySignal(input, thresholds);
  const orc = oracleDeviationSignal(input, thresholds);
  const reasons: string[] = [];

  if (liq.missing) reasons.push('liquidity read missing (fail-closed)');
  else if (liq.tripped) reasons.push('thin liquidity relative to position');
  if (orc.missing) reasons.push('oracle read missing (fail-closed)');
  else if (orc.tripped) reasons.push('oracle price deviates from TWAP');

  // Weighted composite; both signals contribute. Deterministic, no rounding surprises.
  const score = Math.round((liq.value * 0.5 + orc.value * 0.5) * 100);

  const failClosed = liq.missing || orc.missing;
  const yieldbloxShape = liq.tripped && orc.tripped;
  const anomaly = failClosed || yieldbloxShape || score >= SAFE_SCORE_CEILING;

  if (yieldbloxShape) reasons.push('thin-liquidity + oracle-deviation (YieldBlox shape)');

  return {
    poolId: input.poolId,
    score: failClosed ? 100 : score,
    anomaly,
    safe: !anomaly,
    reasons,
  };
}

/**
 * Risk-adjusted yield: raw APY discounted by the pool's risk score. The allocator chases this, never
 * raw APY (R4). A score of 100 halves the effective yield; a score of 0 leaves it untouched.
 */
export function riskAdjustedYield(apy: number, score: number): number {
  return apy * (1 - score / 200);
}

/**
 * Whether a candidate pool beats the current one by more than the sustained-delta threshold, on a
 * risk-adjusted basis (R6). Used by the allocator (U9) to avoid churning on noise. `thresholdPct`
 * is in percentage points of APY.
 */
export function exceedsRebalanceThreshold(
  currentRay: number,
  candidateRay: number,
  thresholdPct: number,
): boolean {
  return candidateRay - currentRay > thresholdPct;
}
