/**
 * Keeper cron — object-real with a spy runner, no network. Asserts it evaluates every driven bucket in
 * one pass, is fail-soft (one bucket's error doesn't stop the loop), and drives the scheduler it's given.
 */

import { describe, expect, it, vi } from 'vitest';
import type { Currency } from '@sorosense/vault-client';
import type { Decision } from '../mastra/allocator.js';
import type { KeeperRunner } from './runner.js';
import { runKeeperCronOnce, startKeeperCron } from './cron.js';

/** A KeeperRunner whose `runTick` is the injected spy; the write actions are inert. */
function fakeRunner(runTick: KeeperRunner['runTick']): KeeperRunner {
  const ok = async () => ({ hash: 'tx', success: true });
  return {
    effects: { compound: async () => {}, rebalance: async () => {}, freezeExit: async () => {} },
    allocate: ok,
    freezePool: ok,
    unfreezePool: ok,
    runTick,
  };
}

const noop = (currency: Currency): Decision => ({ kind: 'noop', currency, reason: 'test' });

describe('runKeeperCronOnce', () => {
  it('evaluates every driven bucket in one pass and returns each decision', async () => {
    const runTick = vi.fn(async (currency: Currency) => noop(currency));
    const log = vi.fn();
    const decisions = await runKeeperCronOnce({ runner: fakeRunner(runTick), currencies: ['USD', 'EUR'], log });

    expect(runTick).toHaveBeenCalledTimes(2);
    expect(decisions.map((d) => d.currency)).toEqual(['USD', 'EUR']);
    expect(decisions.every((d) => d.kind === 'noop')).toBe(true);
    expect(log).toHaveBeenCalledWith('[keeper-cron] USD: noop');
  });

  it('is fail-soft: one bucket throwing does not stop the pass', async () => {
    const runTick = vi.fn(async (currency: Currency) => {
      if (currency === 'USD') throw new Error('rpc blip');
      return noop(currency);
    });
    const log = vi.fn();
    const decisions = await runKeeperCronOnce({ runner: fakeRunner(runTick), currencies: ['USD', 'EUR'], log });

    // Both currencies are still reported; the failed one degrades to a noop carrying the reason.
    expect(decisions).toHaveLength(2);
    expect(decisions[0]).toMatchObject({ currency: 'USD', kind: 'noop' });
    expect(decisions[0]?.kind === 'noop' && decisions[0].reason).toContain('rpc blip');
    expect(decisions[1]).toMatchObject({ currency: 'EUR', kind: 'noop' });
  });
});

describe('startKeeperCron', () => {
  it('schedules the pass at the given interval via the injected scheduler', async () => {
    let scheduled: { intervalMs: number; handler: () => Promise<void> } | null = null;
    const stop = vi.fn();
    const schedule = (intervalMs: number, handler: () => Promise<void>) => {
      scheduled = { intervalMs, handler };
      return { stop };
    };
    const runTick = vi.fn(async (currency: Currency) => noop(currency));

    const handle = startKeeperCron({
      runner: fakeRunner(runTick),
      currencies: ['USD'],
      intervalMs: 12345,
      schedule,
      log: () => {},
    });

    expect(scheduled).not.toBeNull();
    expect(scheduled!.intervalMs).toBe(12345);
    // The scheduled handler runs one pass when fired.
    await scheduled!.handler();
    expect(runTick).toHaveBeenCalledTimes(1);
    handle.stop();
    expect(stop).toHaveBeenCalled();
  });
});
