import { describe, expect, it, vi } from 'vitest';
import { runOnce, startScheduler } from './cron.js';

describe('cron trigger', () => {
  it('runOnce invokes the handler exactly once', async () => {
    const handler = vi.fn(async () => {});
    await runOnce(handler);
    expect(handler).toHaveBeenCalledOnce();
  });

  it('startScheduler fires the handler on the interval and stops cleanly', async () => {
    vi.useFakeTimers();
    const handler = vi.fn(async () => {});
    const sched = startScheduler(1000, handler);

    await vi.advanceTimersByTimeAsync(3000);
    expect(handler).toHaveBeenCalledTimes(3);

    sched.stop();
    await vi.advanceTimersByTimeAsync(3000);
    expect(handler).toHaveBeenCalledTimes(3); // no more calls after stop

    vi.useRealTimers();
  });
});
