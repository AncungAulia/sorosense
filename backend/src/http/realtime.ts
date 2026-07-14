/**
 * The realtime loops (U1 — R2, R3, R4). Stellar RPC does not stream, so "the deposit you just made
 * appears without a restart" is two `setInterval`s: an event poll (`EVENT_POLL_MS`, default 10s) that
 * feeds the composed reads from chain, and a share-price snapshot (`SNAPSHOT_INTERVAL_MS`, default
 * 60s) that gives the earnings chart a real time axis.
 *
 * **Live-only, by construction (R4).** {@link startRealtime} returns `null` the moment
 * `isIntegrationEnv()` is false — before it constructs an event source, before it touches
 * `rpc.Server`, before it starts a scheduler. In offline/mock mode the backend therefore issues ZERO
 * network calls and the history sources stay exactly as they are today (empty), which is what keeps the
 * offline vitest suite and the Playwright baseline green.
 *
 * **Refresh is field-reassignment on the deps object (KTD2).** `createApp(deps)` captures the object and
 * every route dereferences `deps.earnings.events` / `deps.activity.userEvents` *at request time*, so
 * reassigning those two fields is visible to the very next request. `app.ts` needs no change and no
 * existing HTTP test's assumptions move.
 *
 * This module lives beside `server.ts` rather than inside it because `server.ts` binds a port on import
 * and so cannot be imported by a test; the wiring here is fully injectable (source, ledger read,
 * scheduler, clock), which is how the offline "no poller, no scheduler, no `rpc.Server`" guarantee is
 * asserted by spy instead of by watching the network.
 *
 * Read-only: it reads events and share prices. It never writes on-chain, ships no secret, and carries
 * no risk/label/score field.
 */

import { rpc } from '@stellar/stellar-sdk';

import { ALL_CURRENCIES } from '../api/earnings.js';
import {
  makeRpcEventSource,
  type EventSource,
  type RpcEventSourceOptions,
} from '../chain/event-reader.js';
import { InMemoryEventStore } from '../chain/event-store.js';
import { makeChainPoller } from '../chain/poller.js';
import { snapshotTick, type Clock } from '../earnings/snapshotter.js';
import { startScheduler, type Scheduler, type TickHandler } from '../scheduler/cron.js';
import { isIntegrationEnv } from '../tools/vault.js';
import type { HttpAppDeps } from './app.js';

/** How often the event poll runs, when `EVENT_POLL_MS` is unset. */
const DEFAULT_EVENT_POLL_MS = 10_000;
/** How often a share-price snapshot is taken, when `SNAPSHOT_INTERVAL_MS` is unset. */
const DEFAULT_SNAPSHOT_INTERVAL_MS = 60_000;

/**
 * How far back the first poll starts when `VAULT_START_LEDGER` is unset: ~7 days at ~5s/ledger, the
 * RPC's event-retention window (`stellar-dev:data`). Reading from *earlier* than the window is not
 * conservative, it is fatal — the RPC rejects the request and every poll fails (KTD1). So the floor is
 * derived from the CURRENT ledger, never from the deploy ledger, and is clamped to ≥ 1.
 */
const RETENTION_MARGIN_LEDGERS = 120_000;

export interface RealtimeOptions {
  /** Env the gate and the intervals are read from. Defaults to `process.env`. */
  env?: NodeJS.ProcessEnv;
  /** Builds the live event source. Injected in tests so no `rpc.Server` is ever constructed. */
  createSource?: (options: RpcEventSourceOptions) => EventSource;
  /** Reads the chain's current ledger (for the retention clamp). Injected in tests. */
  readLatestLedger?: (rpcUrl: string) => Promise<number>;
  /** Starts an interval. Injected in tests to assert the loops without real timers. */
  schedule?: (intervalMs: number, handler: TickHandler) => Scheduler;
  /** Wall clock for snapshot timestamps. The module cores stay clock-injected; only boot supplies it. */
  clock?: Clock;
  /** Where boot/loop diagnostics go. Defaults to `console`. */
  log?: (message: string) => void;
  onError?: (error: unknown) => void;
}

/** A running realtime wiring. `poll`/`snapshot` are exposed so a boot or a test can drive one by hand. */
export interface RealtimeHandle {
  /** The first ledger the event poll reads from (after the retention clamp). */
  startLedger: number;
  /** Run one event poll now. Fail-soft — never rejects. */
  poll(): Promise<void>;
  /** Take one share-price snapshot now. Fail-soft — never rejects. */
  snapshot(): Promise<void>;
  /** Stop both loops. */
  stop(): void;
}

/** Parse an optional positive-integer env var; anything else falls back to the default. */
function intEnv(raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** The real ledger read — the ONLY place outside the event source that constructs an `rpc.Server`. */
async function defaultReadLatestLedger(rpcUrl: string): Promise<number> {
  const server = new rpc.Server(rpcUrl);
  const latest = await server.getLatestLedger();
  return latest.sequence;
}

/**
 * Resolve the first ledger to poll from: `VAULT_START_LEDGER` when set, else the current ledger minus
 * the retention margin, clamped to ≥ 1. The clamp is what stops a >7-day-old contract from turning
 * every poll into an RPC error (KTD1).
 */
async function resolveStartLedger(
  env: NodeJS.ProcessEnv,
  rpcUrl: string,
  readLatestLedger: (rpcUrl: string) => Promise<number>,
): Promise<number> {
  const configured = env.VAULT_START_LEDGER;
  if (configured !== undefined) {
    const parsed = Number.parseInt(configured, 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  const latest = await readLatestLedger(rpcUrl);
  return Math.max(1, latest - RETENTION_MARGIN_LEDGERS);
}

/**
 * Start the realtime loops when the process is live; do nothing at all when it is not.
 *
 * Live mode: build the event source, run **one immediate poll and one immediate snapshot** so the very
 * first HTTP request is never empty, then schedule both loops. Every `onUpdate` reassigns the two
 * history fields on `deps` (KTD2).
 *
 * Offline mode (integration env unset): returns `null` having constructed nothing — no source, no
 * `rpc.Server`, no scheduler, no socket (R4).
 */
export async function startRealtime(
  deps: HttpAppDeps,
  options: RealtimeOptions = {},
): Promise<RealtimeHandle | null> {
  const env = options.env ?? process.env;
  if (!isIntegrationEnv(env)) return null;

  const log = options.log ?? ((message: string) => console.log(message));
  const onError = options.onError ?? ((error: unknown) => console.error('[realtime]', error));
  const createSource = options.createSource ?? makeRpcEventSource;
  const readLatestLedger = options.readLatestLedger ?? defaultReadLatestLedger;
  const schedule = options.schedule ?? startScheduler;
  const clock = options.clock ?? Date.now;

  // `isIntegrationEnv` already proved these are present; narrow them for the type system.
  const rpcUrl = env.STELLAR_RPC_URL ?? '';
  const contractId = env.VAULT_CONTRACT_ID ?? '';

  let startLedger: number;
  try {
    startLedger = await resolveStartLedger(env, rpcUrl, readLatestLedger);
  } catch (error) {
    // The RPC is unreachable at boot. Serve the composed reads (they degrade to empty history) rather
    // than refusing to boot — but say so loudly, because R2 is not being delivered in this state.
    onError(error);
    log('[realtime] disabled: could not resolve the start ledger from the RPC');
    return null;
  }
  log(`[realtime] polling vault events from ledger ${startLedger}`);

  const source = createSource({ rpcUrl, contractId, startLedger });
  const store = new InMemoryEventStore();
  const poller = makeChainPoller({
    source,
    store,
    onError,
    // KTD2: the routes read these two fields per request, so reassigning them IS the refresh.
    onUpdate: ({ vaultEvents, userEvents, agentEvents }) => {
      deps.earnings.events = vaultEvents;
      deps.activity.userEvents = userEvents;
      deps.activity.agentEvents = agentEvents;
    },
  });

  /** Fail-soft like the poller: a snapshot that throws must not reject into `startScheduler`. */
  const snapshot = async (): Promise<void> => {
    try {
      await snapshotTick(deps.vault, deps.earnings.snapshots, clock, ALL_CURRENCIES);
    } catch (error) {
      onError(error);
    }
  };

  // One immediate tick of each, so the first request served is already chain-sourced.
  await poller.poll();
  await snapshot();

  const eventPollMs = intEnv(env.EVENT_POLL_MS, DEFAULT_EVENT_POLL_MS);
  const snapshotMs = intEnv(env.SNAPSHOT_INTERVAL_MS, DEFAULT_SNAPSHOT_INTERVAL_MS);
  const pollLoop = schedule(eventPollMs, () => poller.poll());
  const snapshotLoop = schedule(snapshotMs, snapshot);
  log(`[realtime] event poll every ${eventPollMs}ms · share-price snapshot every ${snapshotMs}ms`);

  return {
    startLedger,
    poll: () => poller.poll(),
    snapshot,
    stop: () => {
      pollLoop.stop();
      snapshotLoop.stop();
    },
  };
}
