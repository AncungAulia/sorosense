/**
 * The chain event poller (U1, R2). Stellar RPC has NO event streaming — `getEvents` is poll-only
 * (`stellar-dev:data`) — so "the deposit you just made shows up without a restart" is one `setInterval`
 * away, not a WebSocket away. One `poll()` is: drain the pages waiting after the cursor → ingest into
 * the accumulating store (dedupe by event `id`) → re-decode the WHOLE accumulated set → hand both
 * decoded streams to `onUpdate`.
 *
 * Re-decoding the whole set (rather than decoding each page and concatenating) is what keeps `seq`
 * monotonic across polls: `seq` is a position in the ledger-ordered set, so a per-page decode would
 * restart it at 0 every tick and scramble the activity feed's ordering.
 *
 * **Fail-soft, by contract.** `poll()` NEVER rejects: an RPC error is logged and the last good decode
 * is retained (the holder keeps serving what it had), because this runs under `startScheduler`, whose
 * handler rejection would surface as an unhandled rejection and could take the process down. A poll
 * that fails mid-drain keeps whatever pages it already ingested; the next tick resumes from the stored
 * cursor.
 *
 * Read-only: the poller reads events and writes nothing on-chain. It carries no risk/label/score field.
 */

import { decodeEvents, type DecodedEvents, type EventSource } from './event-reader.js';
import type { EventStore } from './event-store.js';

/** Safety cap on pages drained in a single poll, so a source that never advances can't spin forever. */
const MAX_PAGES_PER_POLL = 1000;

export interface ChainPollerOptions {
  /** Where pages come from: the real RPC source in live mode, canned pages in tests. */
  source: EventSource;
  /** The accumulating raw-event store (dedupe + ordering + cursor state). */
  store: EventStore;
  /** Called with the re-decoded accumulated set after a successful poll that ingested something. */
  onUpdate: (decoded: DecodedEvents) => void;
  /** Where an RPC failure is reported. Defaults to `console.error`. Never throws into the interval. */
  onError?: (error: unknown) => void;
  /** Page cap per poll (tests drive it down). Defaults to {@link MAX_PAGES_PER_POLL}. */
  maxPagesPerPoll?: number;
}

export interface ChainPoller {
  /** Run one poll. Resolves even on an RPC error (fail-soft); never rejects. */
  poll(): Promise<void>;
}

/**
 * Build a poller over an {@link EventSource} and an {@link EventStore}. The first poll starts from the
 * source's configured `startLedger` (no cursor yet); every later poll resumes from the store's cursor.
 */
export function makeChainPoller(options: ChainPollerOptions): ChainPoller {
  const { source, store, onUpdate } = options;
  const onError = options.onError ?? ((error: unknown) => console.error('[chain-poller]', error));
  const maxPages = options.maxPagesPerPoll ?? MAX_PAGES_PER_POLL;

  return {
    async poll(): Promise<void> {
      let ingested = 0;

      try {
        for (let page = 0; page < maxPages; page += 1) {
          const cursor = store.cursor();
          const result = await source.getEvents(cursor);
          store.ingest(result);
          ingested += result.events.length;

          // Stop draining when the source signals no further progress: an empty page (nothing new has
          // closed), no cursor, or a cursor that did not advance. The next tick resumes from the
          // stored cursor — this is a poll, not an infinite drain.
          if (
            result.events.length === 0 ||
            result.cursor === undefined ||
            result.cursor === cursor
          ) {
            break;
          }
        }
      } catch (error) {
        // Fail-soft (R2): keep the last good decode, log, and let the next tick retry.
        onError(error);
        return;
      }

      // Nothing new — leave the holder's arrays identity-stable so a request in flight sees no churn.
      if (ingested === 0) return;

      onUpdate(decodeEvents(store.raw()));
    },
  };
}
