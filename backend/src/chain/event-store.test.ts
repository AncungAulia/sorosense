/**
 * The accumulating raw-event store (U1, KTD1). Drives the real store with real `ScVal` events: dedupe
 * by RPC event `id` across overlapping pages, ledger-ascending reads regardless of arrival order, a
 * cursor that only moves forward, and an empty page that changes nothing.
 */

import { describe, expect, it } from 'vitest';
import { Keypair } from '@stellar/stellar-sdk';

import { InMemoryEventStore } from './event-store.js';
import { depositEvt, withdrawEvt } from './__fixtures__/vault-events.js';

const ALICE = Keypair.random().publicKey();

describe('InMemoryEventStore', () => {
  it('de-dupes an event that appears in two overlapping pages', () => {
    const store = new InMemoryEventStore();
    const deposit = depositEvt('e1', 100, ALICE, 'Usd', 1_000n);
    const withdraw = withdrawEvt('e2', 101, ALICE, 'Usd', 400n);

    // Page 2 repeats the deposit (what a cursor-resumed poll routinely returns) and adds the withdraw.
    store.ingest({ events: [deposit], latestLedger: 150, cursor: 'c1' });
    store.ingest({ events: [deposit, withdraw], latestLedger: 200, cursor: 'c2' });

    expect(store.size()).toBe(2);
    expect(store.raw().map((e) => e.id)).toEqual(['e1', 'e2']);
  });

  it('returns events ledger-ascending even when they arrive out of order', () => {
    const store = new InMemoryEventStore();
    store.ingest({ events: [withdrawEvt('e2', 300, ALICE, 'Usd', 400n)], latestLedger: 300, cursor: 'c1' });
    store.ingest({ events: [depositEvt('e1', 100, ALICE, 'Usd', 1_000n)], latestLedger: 300, cursor: 'c2' });

    expect(store.raw().map((e) => e.ledger)).toEqual([100, 300]);
  });

  it('leaves the store unchanged on an empty page, but still records its cursor', () => {
    const store = new InMemoryEventStore();
    store.ingest({ events: [depositEvt('e1', 100, ALICE, 'Usd', 1_000n)], latestLedger: 150, cursor: 'c1' });

    store.ingest({ events: [], latestLedger: 160, cursor: 'c2' });

    expect(store.size()).toBe(1);
    expect(store.raw().map((e) => e.id)).toEqual(['e1']);
    expect(store.cursor()).toBe('c2'); // where the next poll resumes
    expect(store.latestLedger()).toBe(160);
  });

  it('never rewinds the latest-ledger watermark or drops a known cursor', () => {
    const store = new InMemoryEventStore();
    store.ingest({ events: [], latestLedger: 500, cursor: 'c9' });

    // A stale page (lower watermark, no cursor) must not move either backwards.
    store.ingest({ events: [], latestLedger: 100, cursor: undefined });

    expect(store.latestLedger()).toBe(500);
    expect(store.cursor()).toBe('c9');
  });

  it('starts empty: no cursor, zero watermark, no events', () => {
    const store = new InMemoryEventStore();
    expect(store.size()).toBe(0);
    expect(store.raw()).toEqual([]);
    expect(store.cursor()).toBeUndefined();
    expect(store.latestLedger()).toBe(0);
  });
});
