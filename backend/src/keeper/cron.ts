/**
 * Keeper cron — the optional daily heartbeat that lets the agent re-evaluate each bucket on its own,
 * on top of the manual CLI. It runs ONE deterministic allocator tick per currency and acts only if the
 * anti-churn gate (threshold + dwell + switch cost, see `allocator.ts`) says a move pays for itself.
 *
 * **Zero AI cost.** The decision is pure math — the Jatevo model is never called here (KTD6) — so a
 * daily (or hourly) cadence costs nothing in tokens; it only costs a signed tx on the rare tick that
 * actually rebalances. With one Safe pool per currency the evaluation always holds, which is exactly the
 * point: the agent proves it is watching without churning.
 *
 * **Fail-soft.** A currency whose tick throws (a mock-mode write refusal, an RPC blip) is logged and
 * skipped — one bucket never stops the loop, mirroring the realtime poller's posture. Live-only writes
 * still refuse up-front in mock mode (the runner's guard), so an offline cron is a no-op evaluation.
 */

import type { Currency } from '@sorosense/vault-client';
import { getCatalog } from '../tools/catalog.js';
import { startScheduler, type Scheduler } from '../scheduler/cron.js';
import { makeKeeperRunner, type KeeperRunner, type RunTickInput } from './runner.js';
import type { Decision } from '../mastra/allocator.js';

/** Once per day — often enough to catch a materially better venue, rare enough to never churn. */
export const DEFAULT_CRON_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** The demo's driven currencies (MXN has no pool). */
const DEFAULT_CURRENCIES: Currency[] = ['USD', 'EUR'];

/** Safe candidates for a currency, ranked by catalog APY as the risk-adjusted-yield stand-in. */
function candidatesFor(currency: Currency): RunTickInput['candidates'] {
  return getCatalog(currency).map((v) => ({ poolId: v.id, ray: v.apy }));
}

export interface KeeperCronOptions {
  /** Runner to drive. Defaults to a live {@link makeKeeperRunner}. Injectable for tests. */
  runner?: KeeperRunner;
  /** Currencies to evaluate. Defaults to USD + EUR. */
  currencies?: readonly Currency[];
  /** Interval between passes (ms). Defaults to {@link DEFAULT_CRON_INTERVAL_MS}. */
  intervalMs?: number;
  /** Scheduler factory (tests inject a fake). Defaults to {@link startScheduler}. */
  schedule?: (intervalMs: number, handler: () => Promise<void>) => Scheduler;
  /** Structured log sink (tests capture it). Defaults to `console.log`. */
  log?: (message: string) => void;
}

/**
 * Run ONE evaluation pass across the buckets and return each decision. Deterministic; never throws —
 * a per-currency failure is caught, logged, and reported as a `noop` so the caller (and the scheduler)
 * see a complete, non-rejecting result.
 */
export async function runKeeperCronOnce(options: KeeperCronOptions = {}): Promise<Decision[]> {
  const runner = options.runner ?? makeKeeperRunner();
  const currencies = options.currencies ?? DEFAULT_CURRENCIES;
  const log = options.log ?? ((m: string) => console.log(m));

  const decisions: Decision[] = [];
  for (const currency of currencies) {
    try {
      const decision = await runner.runTick(currency, { candidates: candidatesFor(currency) });
      log(`[keeper-cron] ${currency}: ${decision.kind}`);
      decisions.push(decision);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log(`[keeper-cron] ${currency}: skipped (${message})`);
      decisions.push({ kind: 'noop', currency, reason: `cron error: ${message}` });
    }
  }
  return decisions;
}

/**
 * Start the daily keeper cron in-process. Returns a {@link Scheduler} handle to stop it. Overlapping
 * passes are skipped by `startScheduler`, and each pass is fail-soft, so the loop cannot stack or die.
 */
export function startKeeperCron(options: KeeperCronOptions = {}): Scheduler {
  const intervalMs = options.intervalMs ?? DEFAULT_CRON_INTERVAL_MS;
  const schedule = options.schedule ?? startScheduler;
  const log = options.log ?? ((m: string) => console.log(m));
  log(`[keeper-cron] started — evaluating every ${Math.round(intervalMs / 3_600_000)}h (deterministic, 0 AI tokens)`);
  return schedule(intervalMs, async () => {
    await runKeeperCronOnce(options);
  });
}
