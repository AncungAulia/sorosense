import { describe, expect, it, vi } from 'vitest';
import {
  classifyBucket,
  InMemoryBucketStore,
  runAllocatorTick,
  type AllocatorEffects,
  type Candidate,
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
