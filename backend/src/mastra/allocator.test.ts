import { describe, expect, it, vi } from 'vitest';
import {
  classifyBucket,
  InMemoryBucketStore,
  runAllocatorTick,
  DEFAULT_MIN_DWELL_MS,
  type AllocatorEffects,
  type Candidate,
  type ClassifyInput,
} from './allocator.js';

const spyEffects = () => {
  const compound = vi.fn(async () => {});
  const rebalance = vi.fn(async () => {});
  const freezeExit = vi.fn(async () => {});
  return { compound, rebalance, freezeExit } satisfies AllocatorEffects;
};

const safeSet: Candidate[] = [
  { poolId: 'blend-usdc', ray: 6.2 },
  { poolId: 'defindex-usdc', ray: 8.1 },
];

describe('classifyBucket (pure)', () => {
  it('yield accrual on the active pool → compound, no proposal', () => {
    const d = classifyBucket({
      currency: 'USD',
      activePool: 'defindex-usdc',
      activeAnomaly: false,
      activeRay: 8.1,
      candidates: safeSet,
      yieldAccrued: true,
      hasPendingExit: false,
      thresholdPct: 0.5,
    });
    expect(d.kind).toBe('compound');
  });

  it('a better Safe pool over the threshold → auto-rebalance (no proposal)', () => {
    const d = classifyBucket({
      currency: 'USD',
      activePool: 'blend-usdc',
      activeAnomaly: false,
      activeRay: 6.2,
      candidates: safeSet, // defindex 8.1 beats 6.2 by 1.9pp > 0.5
      yieldAccrued: false,
      hasPendingExit: false,
      thresholdPct: 0.5,
    });
    expect(d).toMatchObject({ kind: 'rebalance', from: 'blend-usdc', to: 'defindex-usdc' });
  });

  it('a better pool below the threshold → noop', () => {
    const d = classifyBucket({
      currency: 'USD',
      activePool: 'blend-usdc',
      activeAnomaly: false,
      activeRay: 8.0,
      candidates: [{ poolId: 'defindex-usdc', ray: 8.2 }], // +0.2pp < 0.5
      yieldAccrued: false,
      hasPendingExit: false,
      thresholdPct: 0.5,
    });
    expect(d.kind).toBe('noop');
  });

  it('anomaly on the active pool → freeze-exit, never a silent move', () => {
    const d = classifyBucket({
      currency: 'USD',
      activePool: 'blend-usdc',
      activeAnomaly: true,
      activeRay: 6.2,
      candidates: [{ poolId: 'defindex-usdc', ray: 8.1 }],
      yieldAccrued: false,
      hasPendingExit: false,
      thresholdPct: 0.5,
    });
    expect(d).toMatchObject({ kind: 'freeze-exit', pool: 'blend-usdc', toPool: 'defindex-usdc' });
  });

  it('a pending exit blocks any further action (idempotent)', () => {
    const d = classifyBucket({
      currency: 'USD',
      activePool: 'blend-usdc',
      activeAnomaly: true,
      activeRay: 6.2,
      candidates: safeSet,
      yieldAccrued: true,
      hasPendingExit: true,
      thresholdPct: 0.5,
    });
    expect(d.kind).toBe('noop');
  });
});

describe('classifyBucket — anti-churn gate (threshold + dwell + switch cost)', () => {
  // Active pool yields 8.1; the rival clears it by 2.4pp (> the 1.5 threshold) unless noted.
  const rival: Candidate[] = [
    { poolId: 'defindex-usdc', ray: 8.1 },
    { poolId: 'sorosense-usd', ray: 10.5 },
  ];
  const allocated = (over: Partial<ClassifyInput> = {}): ClassifyInput => ({
    currency: 'USD',
    activePool: 'defindex-usdc',
    activeAnomaly: false,
    activeRay: 8.1,
    candidates: rival,
    yieldAccrued: false,
    hasPendingExit: false,
    thresholdPct: 1.5,
    ...over,
  });

  it('holds when the rival edge is below the threshold (no marginal chase)', () => {
    const d = classifyBucket(
      allocated({ candidates: [{ poolId: 'defindex-usdc', ray: 8.1 }, { poolId: 'sorosense-usd', ray: 9.0 }] }),
    );
    expect(d.kind).toBe('noop'); // 0.9pp edge < 1.5pp — not worth the gas
  });

  it('switches when the rival clears the threshold and no dwell/cost is configured', () => {
    expect(classifyBucket(allocated()).kind).toBe('rebalance');
  });

  it('within the minimum dwell, a materially better rival still does not switch', () => {
    const now = 1_000_000_000_000;
    const d = classifyBucket(
      allocated({ nowMs: now, lastRebalanceAtMs: now - 24 * 60 * 60 * 1000, minDwellMs: DEFAULT_MIN_DWELL_MS }),
    );
    expect(d.kind).toBe('noop'); // moved 1 day ago; the 7-day dwell hasn't elapsed
  });

  it('past the dwell but the gain does not clear the switch cost → hold', () => {
    const now = 1_000_000_000_000;
    const d = classifyBucket(
      allocated({
        nowMs: now,
        lastRebalanceAtMs: now - 8 * 24 * 60 * 60 * 1000, // dwell elapsed
        minDwellMs: DEFAULT_MIN_DWELL_MS,
        positionValueUsd: 100, // tiny bucket
        switchCostUsd: 5,
        dwellHorizonDays: 30,
      }),
    );
    // 2.4% × $100 × 30/365 ≈ $0.20 < $5 gas → not worth moving.
    expect(d.kind).toBe('noop');
  });

  it('past the dwell and the gain clears the switch cost → switch', () => {
    const now = 1_000_000_000_000;
    const d = classifyBucket(
      allocated({
        nowMs: now,
        lastRebalanceAtMs: now - 8 * 24 * 60 * 60 * 1000,
        minDwellMs: DEFAULT_MIN_DWELL_MS,
        positionValueUsd: 100_000, // large bucket
        switchCostUsd: 5,
        dwellHorizonDays: 30,
      }),
    );
    // 2.4% × $100k × 30/365 ≈ $197 > $5 → the move pays for itself.
    expect(d.kind).toBe('rebalance');
  });

  it('seeding an unallocated bucket ignores dwell and cost (it is not a churn-prone switch)', () => {
    const d = classifyBucket(
      allocated({
        activePool: null,
        activeRay: null,
        positionValueUsd: 1,
        switchCostUsd: 999,
        minDwellMs: DEFAULT_MIN_DWELL_MS,
        nowMs: 1_000_000_000_000,
        lastRebalanceAtMs: null,
      }),
    );
    expect(d.kind).toBe('rebalance'); // initial allocation always proceeds
  });
});

describe('runAllocatorTick — dwell clock persists across ticks', () => {
  it('records the move time on rebalance so the next tick honours the dwell window', async () => {
    const effects = spyEffects();
    const store = new InMemoryBucketStore();
    store.setActivePool('USD', 'defindex-usdc');
    let now = 1_000_000_000_000;
    const base = {
      currency: 'USD' as const,
      activeRay: 8.1,
      candidates: [{ poolId: 'defindex-usdc', ray: 8.1 }, { poolId: 'sorosense-usd', ray: 10.5 }],
      thresholdPct: 1.5,
      store,
      effects,
      clock: () => now,
    };

    // First tick: clears the threshold, dwell clock unset → switch, and the move time is recorded.
    const first = await runAllocatorTick(base);
    expect(first.kind).toBe('rebalance');
    expect(store.getLastRebalanceAt('USD')).toBe(now);

    // One day later: still a better rival, but inside the 7-day dwell → hold.
    now += 24 * 60 * 60 * 1000;
    const second = await runAllocatorTick({
      ...base,
      candidates: [{ poolId: 'sorosense-usd', ray: 10.5 }, { poolId: 'ondo-usdy', ray: 13.0 }],
    });
    expect(second.kind).toBe('noop');
    expect(effects.rebalance).toHaveBeenCalledTimes(1); // no second move
  });
});

describe('runAllocatorTick (idempotency + effects)', () => {
  it('drives exactly the rebalance effect and updates the active pool', async () => {
    const store = new InMemoryBucketStore();
    store.setActivePool('USD', 'blend-usdc');
    const effects = spyEffects();

    const d = await runAllocatorTick({
      currency: 'USD',
      activeAnomaly: false,
      activeRay: 6.2,
      candidates: safeSet,
      yieldAccrued: false,
      thresholdPct: 0.5,
      store,
      effects,
    });

    expect(d.kind).toBe('rebalance');
    expect(effects.rebalance).toHaveBeenCalledOnce();
    expect(effects.compound).not.toHaveBeenCalled();
    expect(store.getActivePool('USD')).toBe('defindex-usdc');
  });

  it('does not double-act: after a freeze-exit, the next identical tick is a no-op', async () => {
    const store = new InMemoryBucketStore();
    store.setActivePool('USD', 'blend-usdc');
    const effects = spyEffects();
    const ctx = {
      currency: 'USD' as const,
      activeAnomaly: true,
      activeRay: 6.2,
      candidates: safeSet,
      yieldAccrued: false,
      thresholdPct: 0.5,
      store,
      effects,
    };

    const first = await runAllocatorTick(ctx);
    const second = await runAllocatorTick(ctx);

    expect(first.kind).toBe('freeze-exit');
    expect(second.kind).toBe('noop');
    expect(effects.freezeExit).toHaveBeenCalledOnce(); // not twice
  });
});

describe('runAllocatorTick — auto-compound gating (STE-40)', () => {
  /** A tick whose decision is `compound` (active = best pool, yield accrued). */
  const compoundCtx = (over: Partial<Parameters<typeof runAllocatorTick>[0]>) => {
    const store = new InMemoryBucketStore();
    store.setActivePool('USD', 'defindex-usdc'); // already the best → no rebalance, falls to compound
    return {
      currency: 'USD' as const,
      activeAnomaly: false,
      activeRay: 8.1,
      candidates: safeSet,
      yieldAccrued: true,
      thresholdPct: 0.5,
      store,
      effects: spyEffects(),
      ...over,
    };
  };

  it('compounds only for a depositor who is ON', async () => {
    const ctx = compoundCtx({ depositors: ['alice'], autoCompoundEnabled: async () => true });
    const d = await runAllocatorTick(ctx);
    expect(d.kind).toBe('compound');
    expect(ctx.effects.compound).toHaveBeenCalledOnce();
    expect(ctx.effects.compound).toHaveBeenCalledWith('USD', 'defindex-usdc', 'alice');
  });

  it('skips compound for a depositor who is OFF — the decision is still compound', async () => {
    const ctx = compoundCtx({ depositors: ['alice'], autoCompoundEnabled: async () => false });
    const d = await runAllocatorTick(ctx);
    expect(d.kind).toBe('compound'); // classify unchanged
    expect(ctx.effects.compound).not.toHaveBeenCalled(); // but no reinvest
  });

  it('gates per depositor — compounds ON, skips OFF, in the same bucket', async () => {
    const ctx = compoundCtx({
      depositors: ['alice', 'bob'],
      autoCompoundEnabled: async (d) => d === 'alice',
    });
    await runAllocatorTick(ctx);
    expect(ctx.effects.compound).toHaveBeenCalledOnce();
    expect(ctx.effects.compound).toHaveBeenCalledWith('USD', 'defindex-usdc', 'alice');
  });

  it('fail-closed: an unreadable preference skips compound (never reinvests unverified)', async () => {
    const ctx = compoundCtx({
      depositors: ['alice'],
      autoCompoundEnabled: async () => {
        throw new Error('rpc down');
      },
    });
    await runAllocatorTick(ctx);
    expect(ctx.effects.compound).not.toHaveBeenCalled();
  });

  it('rebalance is unaffected by the preference — it still fires for an OFF depositor', async () => {
    const store = new InMemoryBucketStore();
    store.setActivePool('USD', 'blend-usdc'); // defindex (8.1) beats 6.2 by >0.5 → rebalance
    const effects = spyEffects();
    const d = await runAllocatorTick({
      currency: 'USD',
      activeAnomaly: false,
      activeRay: 6.2,
      candidates: safeSet,
      yieldAccrued: false,
      thresholdPct: 0.5,
      store,
      effects,
      depositors: ['alice'],
      autoCompoundEnabled: async () => false, // OFF
    });
    expect(d.kind).toBe('rebalance');
    expect(effects.rebalance).toHaveBeenCalledOnce();
    expect(effects.compound).not.toHaveBeenCalled();
  });

  it('ungated (no preference wired) compounds at the pool level as before', async () => {
    const ctx = compoundCtx({}); // no depositors / autoCompoundEnabled
    const d = await runAllocatorTick(ctx);
    expect(d.kind).toBe('compound');
    expect(ctx.effects.compound).toHaveBeenCalledWith('USD', 'defindex-usdc');
  });
});
