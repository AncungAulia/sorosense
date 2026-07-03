/**
 * External trigger for the allocator (KTD5). Mastra has no built-in scheduler, so the 24/7 monitor
 * is driven either by an in-process interval (local/dev) or a serverless route calling `runOnce`
 * (deploy). Both just invoke the handler; the handler runs the allocator tick per bucket.
 */

export type TickHandler = () => Promise<void>;

/** Invoke the handler exactly once (for a cron route / queue trigger). Errors are surfaced, not swallowed. */
export async function runOnce(handler: TickHandler): Promise<void> {
  await handler();
}

export interface Scheduler {
  stop(): void;
}

/**
 * Run the handler every `intervalMs` in-process (local/dev). Overlapping runs are skipped so a slow
 * tick never stacks. Returns a handle to stop the loop.
 */
export function startScheduler(intervalMs: number, handler: TickHandler): Scheduler {
  let running = false;
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    void handler().finally(() => {
      running = false;
    });
  }, intervalMs);
  return { stop: () => clearInterval(timer) };
}
