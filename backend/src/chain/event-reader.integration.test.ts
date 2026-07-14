/**
 * Integration test for the on-chain event reader (STE-21 Fase C, U1). Object-real: it builds genuine
 * Soroban `ScVal` topics/data exactly as the vault's `#[contractevent]` types emit them (event-name
 * symbol in snake_case at topic[0], the indexed field next, the rest in a data map), wraps them in a
 * FAKE `EventSource` (canned pages, no network), and feeds the reader's output through the REAL pure
 * derivations `reconstructCostBasis` and `deriveUserActivity`. No mocks of the decode path.
 */

import { describe, expect, it } from 'vitest';
import { Address, Keypair, nativeToScVal, xdr } from '@stellar/stellar-sdk';
import {
  readVaultEvents,
  type EventPage,
  type EventSource,
  type RawEvent,
} from './event-reader.js';
import { reconstructCostBasis } from '../earnings/cost-basis.js';
import { deriveUserActivity } from '../api/user-activity.js';

const RISK_WORDS = /\b(risk|risks|risky|tier|tiers|score|scores)\b/i;

// A stable depositor address (seam `Address` is the string form of the account).
const ALICE = Keypair.random().publicKey();

// ── ScVal builders mirroring the contract's emitted events ──────────────────────────────────────

function i128(n: bigint): xdr.ScVal {
  return nativeToScVal(n, { type: 'i128' });
}

/** A Soroban unit enum (`Currency`) serializes as a single-element vec of the variant symbol. */
function currencyScv(variant: string): xdr.ScVal {
  return xdr.ScVal.scvVec([xdr.ScVal.scvSymbol(variant)]);
}

function mapEntry(key: string, val: xdr.ScVal): xdr.ScMapEntry {
  return new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol(key), val });
}

/** Data map for Deposit/Withdraw: the non-topic fields `{ currency, amount, shares }` (keys sorted). */
function moveData(variant: string, amount: bigint, shares: bigint): xdr.ScVal {
  return xdr.ScVal.scvMap([
    mapEntry('amount', i128(amount)),
    mapEntry('currency', currencyScv(variant)),
    mapEntry('shares', i128(shares)),
  ]);
}

interface EvtOpts {
  id: string;
  ledger: number;
  name: string;
  addr?: string;
  currencyTopic?: string;
  data?: xdr.ScVal;
}

/** Build a RawEvent with topic[0]=event-name symbol, an optional indexed field, and a data value. */
function evt(opts: EvtOpts): RawEvent {
  const topic: xdr.ScVal[] = [xdr.ScVal.scvSymbol(opts.name)];
  if (opts.addr !== undefined) topic.push(new Address(opts.addr).toScVal());
  if (opts.currencyTopic !== undefined) topic.push(currencyScv(opts.currencyTopic));
  return {
    id: opts.id,
    ledger: opts.ledger,
    topic,
    value: opts.data ?? xdr.ScVal.scvMap([]),
  };
}

/** A fake source that hands back canned pages in order, ignoring the cursor value it is given. */
function fakeSource(pages: EventPage[]): EventSource {
  let call = 0;
  return {
    async getEvents(): Promise<EventPage> {
      const page = pages[call] ?? { events: [], latestLedger: 0, cursor: undefined };
      call += 1;
      return page;
    },
  };
}

// Canonical events for a single-page scenario: a deposit then a partial withdraw, then the two
// consent-adjacent user actions.
const depositEvt = evt({ id: 'e1', ledger: 100, name: 'deposit', addr: ALICE, data: moveData('Usd', 1_000n, 1_000n) });
const withdrawEvt = evt({ id: 'e2', ledger: 101, name: 'withdraw', addr: ALICE, data: moveData('Usd', 400n, 400n) });
const consentEvt = evt({ id: 'e3', ledger: 102, name: 'consent_set', addr: ALICE });
const autoCompoundEvt = evt({
  id: 'e4',
  ledger: 103,
  name: 'auto_compound_set',
  addr: ALICE,
  data: xdr.ScVal.scvMap([mapEntry('enabled', xdr.ScVal.scvBool(false))]),
});

describe('readVaultEvents', () => {
  it('decodes Deposit + Withdraw to VaultEvent rows that feed reconstructCostBasis correctly', async () => {
    const source = fakeSource([
      { events: [depositEvt, withdrawEvt], latestLedger: 200, cursor: undefined },
    ]);

    const { vaultEvents } = await readVaultEvents(source);

    // Two rows, seq-ordered by ledger (deposit before withdraw).
    expect(vaultEvents.map((e) => e.kind)).toEqual(['deposit', 'withdraw']);
    expect(vaultEvents.map((e) => e.seq)).toEqual([0, 1]);
    expect(vaultEvents[0]).toMatchObject({
      kind: 'deposit',
      depositor: ALICE,
      currency: 'USD',
      amount: 1_000n,
      shares: 1_000n,
    });
    expect(vaultEvents[1]).toMatchObject({
      kind: 'withdraw',
      depositor: ALICE,
      currency: 'USD',
      amount: 400n,
      shares: 400n,
    });

    // Feed the REAL cost-basis reconstruction: 1000 in, 400/1000 shares out → 600 shares, 600 basis.
    const bases = reconstructCostBasis(vaultEvents);
    const basis = bases.get(`${ALICE}:USD`);
    expect(basis).toEqual({ shares: 600n, contributed: 600n });
  });

  it('decodes user actions incl. auto-compound + sign-mandate, and deriveUserActivity is risk-word-free', async () => {
    const source = fakeSource([
      {
        events: [depositEvt, withdrawEvt, consentEvt, autoCompoundEvt],
        latestLedger: 200,
        cursor: undefined,
      },
    ]);

    const { userEvents } = await readVaultEvents(source);

    expect(userEvents.map((e) => e.kind)).toEqual(['deposit', 'withdraw', 'sign-mandate', 'auto-compound']);

    // auto-compound decodes its `enabled` flag from the data map.
    const auto = userEvents.find((e) => e.kind === 'auto-compound');
    expect(auto).toMatchObject({ kind: 'auto-compound', depositor: ALICE, enabled: false });

    // sign-mandate is per-depositor, no currency.
    const mandate = userEvents.find((e) => e.kind === 'sign-mandate');
    expect(mandate).toMatchObject({ kind: 'sign-mandate', depositor: ALICE });

    // The REAL derivation yields a plain-language, risk-word-free detail for every decoded kind.
    const rows = deriveUserActivity(userEvents);
    expect(rows.map((r) => r.kind)).toEqual(['deposit', 'withdraw', 'sign-mandate', 'auto-compound']);
    for (const row of rows) {
      expect(row.detail).not.toMatch(RISK_WORDS);
      expect(row.detail.length).toBeGreaterThan(0);
    }
    expect(rows.find((r) => r.kind === 'auto-compound')?.detail).toContain('off');
  });

  it('accumulates two pages via cursor in seq order with no dupes', async () => {
    // Page 1 has the deposit and advances the cursor; page 2 repeats the deposit (overlap) and adds
    // the withdraw, then stops (no cursor). The repeat must be de-duped by id.
    const source = fakeSource([
      { events: [depositEvt], latestLedger: 150, cursor: 'cursor-1' },
      { events: [depositEvt, withdrawEvt], latestLedger: 200, cursor: undefined },
    ]);

    const { vaultEvents, latestLedger, cursor } = await readVaultEvents(source);

    expect(vaultEvents.map((e) => e.kind)).toEqual(['deposit', 'withdraw']);
    expect(vaultEvents.map((e) => e.seq)).toEqual([0, 1]);
    expect(latestLedger).toBe(200);
    expect(cursor).toBe('cursor-1'); // last non-empty page's cursor was undefined → keep prior
  });

  it('ignores an unknown/irrelevant topic instead of mis-decoding it', async () => {
    const allocated = evt({
      id: 'x1',
      ledger: 105,
      name: 'allocated',
      currencyTopic: 'Usd',
      data: xdr.ScVal.scvMap([mapEntry('amount', i128(999n))]),
    });
    const source = fakeSource([
      { events: [depositEvt, allocated], latestLedger: 200, cursor: undefined },
    ]);

    const { vaultEvents, userEvents } = await readVaultEvents(source);

    // Only the deposit decodes; the `allocated` event is neither a vault nor a user row.
    expect(vaultEvents).toHaveLength(1);
    expect(vaultEvents[0]?.kind).toBe('deposit');
    expect(userEvents.map((e) => e.kind)).toEqual(['deposit']);
  });
});
