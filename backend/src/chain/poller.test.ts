/**
 * The chain event poller (U1, R2). Object-real: canned `ScVal` pages drive the REAL decoder, the REAL
 * store and the REAL poller — no network, no mock of the decode path. The guards under test are the
 * three that make an interval-driven poll safe:
 *  - `seq` stays monotonic ACROSS polls (the poller re-decodes the accumulated set, never per page);
 *  - an RPC failure is fail-soft — the holder keeps the last good decode and `poll()` does not reject;
 *  - a source whose cursor never advances terminates instead of draining forever.
 */

import { describe, expect, it, vi } from 'vitest';
import { Keypair } from '@stellar/stellar-sdk';

import { InMemoryEventStore } from './event-store.js';
import { makeChainPoller } from './poller.js';
import type { DecodedEvents, EventPage, EventSource } from './event-reader.js';
import { depositEvt, scriptedSource, withdrawEvt } from './__fixtures__/vault-events.js';

const ALICE = Keypair.random().publicKey();

const deposit = depositEvt('e1', 100, ALICE, 'Usd', 1_000n);
const withdraw = withdrawEvt('e2', 101, ALICE, 'Usd', 400n);

/** A holder mirroring `server.ts`: the poller reassigns the fields the routes dereference (KTD2). */
function makeHolder(): { latest: DecodedEvents | null; onUpdate: (d: DecodedEvents) => void } {
  const holder: { latest: DecodedEvents | null; onUpdate: (d: DecodedEvents) => void } = {
    latest: null,
    onUpdate: (d) => {
      holder.latest = d;
    },
  };
  return holder;
}

describe('makeChainPoller', () => {
  it('accumulates across two polls with seq monotonic over the whole set', async () => {
    // Poll 1 sees the deposit (page 1 then an empty page: nothing more has closed). Poll 2 sees the
    // withdraw. A per-page decode would restart seq at 0 on poll 2; the accumulated decode must not.
    const source = scriptedSource([
      { events: [deposit], latestLedger: 150, cursor: 'c1' },
      { events: [], latestLedger: 150, cursor: 'c1' },
      { events: [withdraw], latestLedger: 200, cursor: 'c2' },
      { events: [], latestLedger: 200, cursor: 'c2' },
    ]);
    const store = new InMemoryEventStore();
    const holder = makeHolder();
    const poller = makeChainPoller({ source, store, onUpdate: holder.onUpdate });

    await poller.poll();
    expect(holder.latest?.vaultEvents.map((e) => e.kind)).toEqual(['deposit']);

    await poller.poll();

    expect(holder.latest?.vaultEvents.map((e) => e.kind)).toEqual(['deposit', 'withdraw']);
    expect(holder.latest?.vaultEvents.map((e) => e.seq)).toEqual([0, 1]);
    expect(holder.latest?.userEvents.map((e) => e.seq)).toEqual([0, 1]);

    // The second poll resumed from the stored cursor rather than re-reading from the start ledger.
    expect(source.calls).toEqual([undefined, 'c1', 'c1', 'c2']);
  });

  it('is fail-soft: a throwing source keeps the last good decode and poll() resolves', async () => {
    let call = 0;
    const pages: EventPage[] = [{ events: [deposit], latestLedger: 150, cursor: 'c1' }];
    const flaky: EventSource = {
      async getEvents(cursor?: string): Promise<EventPage> {
        call += 1;
        if (call === 1) return pages[0] as EventPage;
        if (call === 2) return { events: [], latestLedger: 150, cursor };
        throw new Error('rpc unavailable');
      },
    };
    const holder = makeHolder();
    const onError = vi.fn();
    const poller = makeChainPoller({
      source: flaky,
      store: new InMemoryEventStore(),
      onUpdate: holder.onUpdate,
      onError,
    });

    await poller.poll();
    const afterFirst = holder.latest;
    expect(afterFirst?.vaultEvents).toHaveLength(1);

    // The second poll throws — it must resolve (never poison the scheduler) and change nothing.
    await expect(poller.poll()).resolves.toBeUndefined();

    expect(onError).toHaveBeenCalledOnce();
    expect(holder.latest).toBe(afterFirst); // the last good decode, untouched
  });

  it('terminates when the source keeps returning the same cursor (no infinite drain)', async () => {
    let calls = 0;
    const stuck: EventSource = {
      async getEvents(): Promise<EventPage> {
        calls += 1;
        return { events: [deposit], latestLedger: 150, cursor: 'stuck' }; // cursor never advances
      },
    };
    const holder = makeHolder();
    const poller = makeChainPoller({
      source: stuck,
      store: new InMemoryEventStore(),
      onUpdate: holder.onUpdate,
    });

    await poller.poll();

    // Page 1 sets the cursor; page 2 returns the same one → drain stops. Not MAX_PAGES_PER_POLL calls.
    expect(calls).toBe(2);
    expect(holder.latest?.vaultEvents).toHaveLength(1); // the repeat is de-duped by event id
  });

  it('does not re-notify the holder when a poll brings nothing new', async () => {
    const source = scriptedSource([
      { events: [deposit], latestLedger: 150, cursor: 'c1' },
      { events: [], latestLedger: 150, cursor: 'c1' },
      { events: [], latestLedger: 150, cursor: 'c1' },
    ]);
    const onUpdate = vi.fn();
    const poller = makeChainPoller({ source, store: new InMemoryEventStore(), onUpdate });

    await poller.poll();
    await poller.poll();

    expect(onUpdate).toHaveBeenCalledOnce(); // the empty second poll leaves the holder alone
  });
});
