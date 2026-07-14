/**
 * Canned Soroban events for the chain tests (object-real, no network). These build genuine `ScVal`
 * topics/data exactly as the vault's `#[contractevent]` types emit them — event-name symbol in
 * snake_case at topic[0], the indexed depositor next, the remaining fields in a data map — so the
 * store, the poller and the HTTP realtime test all drive the REAL decoder rather than a stub of it.
 *
 * Test-support only: nothing here is imported by production code.
 */

import { Address, nativeToScVal, xdr } from '@stellar/stellar-sdk';

import type { EventPage, EventSource, RawEvent } from '../event-reader.js';

/** An i128 amount/shares field, as the contract emits it. */
export function i128(n: bigint): xdr.ScVal {
  return nativeToScVal(n, { type: 'i128' });
}

/** A Soroban unit enum (`Currency`) serializes as a single-element vec of the variant symbol. */
export function currencyScv(variant: string): xdr.ScVal {
  return xdr.ScVal.scvVec([xdr.ScVal.scvSymbol(variant)]);
}

export function mapEntry(key: string, val: xdr.ScVal): xdr.ScMapEntry {
  return new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol(key), val });
}

/** Data map for Deposit/Withdraw: the non-topic fields `{ currency, amount, shares }` (keys sorted). */
export function moveData(variant: string, amount: bigint, shares: bigint): xdr.ScVal {
  return xdr.ScVal.scvMap([
    mapEntry('amount', i128(amount)),
    mapEntry('currency', currencyScv(variant)),
    mapEntry('shares', i128(shares)),
  ]);
}

export interface EvtOpts {
  id: string;
  ledger: number;
  name: string;
  addr?: string;
  ledgerClosedAt?: string;
  data?: xdr.ScVal;
}

/** Build a RawEvent with topic[0]=event-name symbol, an optional indexed depositor, and a data value. */
export function evt(opts: EvtOpts): RawEvent {
  const topic: xdr.ScVal[] = [xdr.ScVal.scvSymbol(opts.name)];
  if (opts.addr !== undefined) topic.push(new Address(opts.addr).toScVal());
  return {
    id: opts.id,
    ledger: opts.ledger,
    ...(opts.ledgerClosedAt !== undefined ? { ledgerClosedAt: opts.ledgerClosedAt } : {}),
    topic,
    value: opts.data ?? xdr.ScVal.scvMap([]),
  };
}

/** A `deposit` event for a depositor, in the bucket's native base units. */
export function depositEvt(
  id: string,
  ledger: number,
  addr: string,
  variant: string,
  amount: bigint,
  ledgerClosedAt?: string,
): RawEvent {
  return evt({
    id,
    ledger,
    name: 'deposit',
    addr,
    ...(ledgerClosedAt !== undefined ? { ledgerClosedAt } : {}),
    data: moveData(variant, amount, amount), // base share price ⇒ shares == amount
  });
}

/** A `withdraw` event for a depositor. */
export function withdrawEvt(
  id: string,
  ledger: number,
  addr: string,
  variant: string,
  amount: bigint,
  ledgerClosedAt?: string,
): RawEvent {
  return evt({
    id,
    ledger,
    name: 'withdraw',
    addr,
    ...(ledgerClosedAt !== undefined ? { ledgerClosedAt } : {}),
    data: moveData(variant, amount, amount),
  });
}

/**
 * A fake {@link EventSource} that hands back the given pages in order, recording every cursor it was
 * called with (so a test can assert the poller resumes from the store's cursor rather than restarting).
 * Past the last page it returns an empty page carrying the last cursor — exactly what a real RPC does
 * when nothing new has closed.
 */
export function scriptedSource(pages: EventPage[]): EventSource & { calls: Array<string | undefined> } {
  let call = 0;
  const calls: Array<string | undefined> = [];
  return {
    calls,
    async getEvents(cursor?: string): Promise<EventPage> {
      calls.push(cursor);
      const page = pages[call];
      call += 1;
      if (page === undefined) return { events: [], latestLedger: 0, cursor };
      return page;
    },
  };
}
