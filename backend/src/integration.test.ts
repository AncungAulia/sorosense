/**
 * U12 — cross-module backend integration tests. Wires Sentinel scoring → risk-adjusted candidates →
 * allocator classification → freeze path, plus the read-only API guarantee. Asserts the product
 * invariants end-to-end (not just per-unit): auto-rebalance never creates a proposal, freeze is
 * idempotent and moves no funds, and the user-facing API cannot mutate state.
 */

import { describe, expect, it, vi } from 'vitest';
import { MockVaultClient, mockSigner, type Currency } from '@sorosense/vault-client';

import { scorePool } from './sentinel/score.js';
import { riskAdjustedYield } from './sentinel/score.js';
import { freezePool } from './sentinel/freeze.js';
import {
  classifyBucket,
  InMemoryBucketStore,
  runAllocatorTick,
  type AllocatorEffects,
  type Candidate,
} from './mastra/allocator.js';
import { simulate } from './api/simulate.js';
import { ActivityLog } from './api/activity.js';

const keeper = mockSigner('keeper', 'sentinel');
const alice = mockSigner('depositor', 'alice');

/** Build a risk-adjusted candidate from a pool's APY and its Sentinel signal inputs. */
function candidate(poolId: string, apy: number, liq: number, twap: number, spot: number): Candidate {
  const assessment = scorePool({ poolId, liquidityUsd: liq, positionUsd: 1_000, oracleTwap: twap, oracleSpot: spot });
  return { poolId, ray: riskAdjustedYield(apy, assessment.score) };
}

const spyEffects = () => {
  const compound = vi.fn(async () => {});
  const rebalance = vi.fn(async () => {});
  const freezeExit = vi.fn(async () => {});
  return { compound, rebalance, freezeExit } satisfies AllocatorEffects;
};

describe('AE1 — auto-earn then auto-rebalance, no proposal', () => {
  it('rebalances to the better Safe pool automatically and creates no depositor proposal', async () => {
    const store = new InMemoryBucketStore();
    store.setActivePool('USD', 'blend-usdc');
    const effects = spyEffects();

    // Both healthy; DeFindex (8.59%) clearly beats Blend (6.6%) risk-adjusted.
    const candidates = [
      candidate('blend-usdc', 6.6, 4_200_000, 1, 1.0001),
      candidate('defindex-usdc', 8.59, 1_100_000, 1, 1.0001),
    ];

    const d = await runAllocatorTick({
      currency: 'USD',
      activeAnomaly: false,
      activeRay: candidates[0]!.ray,
      candidates,
      yieldAccrued: false,
      thresholdPct: 0.5,
      store,
      effects,
    });

    expect(d.kind).toBe('rebalance');
    expect(effects.rebalance).toHaveBeenCalledOnce();
    // The invariant: an auto-rebalance never asks the depositor to approve anything.
    expect(effects.freezeExit).not.toHaveBeenCalled();
  });
});

describe('AE3 — sub-threshold improvement makes no move', () => {
  it('does not rebalance when the better pool beats the current by less than the threshold', () => {
    const candidates = [
      candidate('blend-usdc', 8.0, 4_200_000, 1, 1.0001),
      candidate('defindex-usdc', 8.2, 1_100_000, 1, 1.0001), // ~0.2pp better < 0.5pp
    ];
    const d = classifyBucket({
      currency: 'USD',
      activePool: 'blend-usdc',
      activeAnomaly: false,
      activeRay: candidates[0]!.ray,
      candidates,
      yieldAccrued: false,
      hasPendingExit: false,
      thresholdPct: 0.5,
    });
    expect(d.kind).toBe('noop');
  });
});

describe('AE2 — Sentinel freeze is idempotent and moves no funds', () => {
  it('freezes an anomalous held pool once and leaves the balance untouched', async () => {
    const vault = new MockVaultClient();
    await vault.deposit('alice', 'USD', 1_000n).signAndSubmit(alice);
    await vault.allocate('blend-usdc', 'USD', 1_000n).signAndSubmit(keeper);

    // Anomaly detected by Sentinel (thin liquidity + oracle deviation).
    const assessment = scorePool({
      poolId: 'blend-usdc',
      liquidityUsd: 5_000,
      positionUsd: 1_000,
      oracleTwap: 1,
      oracleSpot: 1.08,
    });
    expect(assessment.anomaly).toBe(true);

    const first = await freezePool('blend-usdc', { vault, keeper });
    const second = await freezePool('blend-usdc', { vault, keeper });

    expect(first.status).toBe('frozen');
    expect(second.status).toBe('already-frozen'); // idempotent
    expect(await vault.balanceOf('alice', 'USD')).toBe(1_000n); // moved nothing
  });
});

describe('read-only API guarantee (no chat, no execution)', () => {
  it('simulate + activity never mutate vault state', async () => {
    const vault = new MockVaultClient();
    await vault.deposit('alice', 'USD', 1_000n).signAndSubmit(alice);
    const before = await vault.balanceOf('alice', 'USD');

    // The user-facing surfaces do not take a vault and cannot move funds.
    const projection = simulate({ currency: 'USD' as Currency, amount: 1_000, periodDays: 365 });
    const log = new ActivityLog();
    log.append({ currency: 'USD', kind: 'allocated', detail: 'USD -> Blend USDC' });

    expect(projection.projectedEarnings).toBeGreaterThan(0);
    expect(log.list('USD')).toHaveLength(1);
    expect(await vault.balanceOf('alice', 'USD')).toBe(before); // unchanged
  });
});
