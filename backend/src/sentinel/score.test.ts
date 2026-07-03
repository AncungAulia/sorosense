import { describe, expect, it } from 'vitest';
import {
  exceedsRebalanceThreshold,
  riskAdjustedYield,
  SAFE_SCORE_CEILING,
  scorePool,
} from './score.js';
import type { PoolSignalInput } from './signals.js';

const healthy: PoolSignalInput = {
  poolId: 'blend-usdc',
  liquidityUsd: 4_200_000,
  positionUsd: 1_000,
  oracleTwap: 1.0,
  oracleSpot: 1.0001,
};

describe('scorePool', () => {
  it('scores a healthy pool low with no anomaly (safe)', () => {
    const r = scorePool(healthy);
    expect(r.anomaly).toBe(false);
    expect(r.safe).toBe(true);
    expect(r.score).toBeLessThan(SAFE_SCORE_CEILING);
  });

  it('trips an anomaly on the YieldBlox shape (thin liquidity + oracle deviation)', () => {
    const r = scorePool({
      poolId: 'yieldblox-eurc',
      liquidityUsd: 5_000, // position is a large fraction of liquidity
      positionUsd: 1_000,
      oracleTwap: 1.0,
      oracleSpot: 1.08, // 8% deviation
    });
    expect(r.anomaly).toBe(true);
    expect(r.safe).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/YieldBlox shape/);
  });

  it('fails closed when the oracle read is missing', () => {
    const r = scorePool({ ...healthy, oracleSpot: null });
    expect(r.anomaly).toBe(true);
    expect(r.score).toBe(100);
    expect(r.reasons.join(' ')).toMatch(/oracle read missing/);
  });

  it('fails closed when the liquidity read is missing', () => {
    const r = scorePool({ ...healthy, liquidityUsd: null });
    expect(r.anomaly).toBe(true);
    expect(r.score).toBe(100);
  });

  it('is deterministic for fixed inputs', () => {
    expect(scorePool(healthy)).toEqual(scorePool(healthy));
  });
});

describe('rebalance threshold (R6)', () => {
  it('does not rebalance when a better pool beats the current by less than the threshold', () => {
    const current = riskAdjustedYield(6.6, 10);
    const candidate = riskAdjustedYield(6.9, 10); // ~0.28pp better, below a 0.5pp threshold
    expect(exceedsRebalanceThreshold(current, candidate, 0.5)).toBe(false);
  });

  it('rebalances when the improvement clears the threshold', () => {
    const current = riskAdjustedYield(6.6, 10);
    const candidate = riskAdjustedYield(8.59, 10); // ~1.9pp better
    expect(exceedsRebalanceThreshold(current, candidate, 0.5)).toBe(true);
  });

  it('risk-adjusted yield discounts a riskier pool below a safer, lower-APY one', () => {
    const safeLower = riskAdjustedYield(6.6, 5);
    const riskyHigher = riskAdjustedYield(9.0, 90);
    expect(safeLower).toBeGreaterThan(riskyHigher);
  });
});
