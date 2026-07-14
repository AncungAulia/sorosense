/**
 * Accumulating raw-event store for the chain poller (U1, KTD1).
 *
 * Stellar RPC has NO streaming and retains contract events for only ~7 days (`stellar-dev:data`), so
 * "realtime" is a poll loop and "just re-read everything from the deploy ledger each tick" is a trap:
 * it works today and starts failing the day the vault turns eight days old. The poller therefore reads
 * forward from a cursor and *accumulates* here — this store is the process's memory of every event it
 * has ever seen, deduped by the RPC's unique event `id` and kept ledger-ordered so the decoder can
 * assign `seq` over the whole set (never per page).
 *
 * Honest limits, stated out loud: the store is in-process. History older than the RPC retention window
 * AND older than this process cannot be reconstructed after a restart — a durable store is the
 * follow-up (see the plan's Scope Boundaries). Read-only by construction: it holds raw XDR events and
 * decodes nothing, writes nothing on-chain, and carries no risk/label/score field.
 */

import type { EventPage, RawEvent } from './event-reader.js';

/** The accumulating raw-event store the poller drains into. */
export interface EventStore {
  /** Ingest one RPC page: new events are appended (dupes dropped), cursor/watermark advanced. */
  ingest(page: EventPage): void;
  /** Every event seen so far, ledger-ascending (stable within a ledger). A fresh copy each call. */
  raw(): RawEvent[];
  /** The cursor the next poll resumes from, or `undefined` before the first page carries one. */
  cursor(): string | undefined;
  /** The RPC's latest-ledger watermark from the most advanced page ingested. */
  latestLedger(): number;
  /** How many distinct events are held. */
  size(): number;
}

/**
 * In-memory {@link EventStore}. Dedupe is by event `id` (the RPC's paging token, unique per event), so
 * overlapping pages — which a cursor-resumed poll produces routinely — are idempotent. `raw()` sorts by
 * ledger with a stable comparator, preserving within-ledger arrival order; sorting on read (not on
 * write) keeps `ingest` O(page) and the demo's event count is small.
 */
export class InMemoryEventStore implements EventStore {
  private readonly byId = new Map<string, RawEvent>();
  private nextCursor: string | undefined;
  private watermark = 0;

  ingest(page: EventPage): void {
    for (const event of page.events) {
      if (this.byId.has(event.id)) continue; // idempotent across overlapping pages
      this.byId.set(event.id, event);
    }
    // Only ever move the watermark forward: a stale/duplicate page must not rewind it.
    if (page.latestLedger > this.watermark) this.watermark = page.latestLedger;
    // An empty page still carries a cursor worth keeping (it is where the next poll resumes).
    if (page.cursor !== undefined) this.nextCursor = page.cursor;
  }

  raw(): RawEvent[] {
    return [...this.byId.values()].sort((a, b) => a.ledger - b.ledger);
  }

  cursor(): string | undefined {
    return this.nextCursor;
  }

  latestLedger(): number {
    return this.watermark;
  }

  size(): number {
    return this.byId.size;
  }
}
