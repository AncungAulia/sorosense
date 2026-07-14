/**
 * EH-U6 — cross-module earnings integration. Wires the real MockVaultClient (NAV share math) →
 * snapshotter (price series) → cost-basis (contributions) → earnings API (blended view), asserting the
 * product invariants end-to-end rather than per-unit: earned tracks real yield only (FX is never
 * earnings), the deposited view is read-only, buckets blend for display but never convert, and a
 * mid-period deposit does not inflate earned.
 */

import { describe, expect, it } from 'vitest';
import { MockVaultClient, mockSigner, type Address, type Currency } from '@sorosense/vault-client';

import { ok, type Result } from '../lib/result.js';
import { InMemorySnapshotStore, snapshotTick } from './snapshotter.js';
import type { VaultEvent } from './cost-basis.js';
import { getEarnings, type FxSource } from '../api/earnings.js';

const alice = mockSigner('depositor', 'alice');
const CURRENCIES: readonly Currency[] = ['USD', 'EUR', 'MXN'];
/** On-chain 7-decimal base units (matches the seam's UNIT); getEarnings divides by this for USD. */
const UNIT = 10_000_000n;
const U = (whole: number): bigint => BigInt(whole) * UNIT;
const okFx = (map: Partial<Record<Currency, number>> = {}): FxSource => async (c) => ok(map[c] ?? 1);

/** Deposit into the mock AND record the matching event with the shares the mock actually minted. */
async function depositAndRecord(
  vault: MockVaultClient,
  events: VaultEvent[],
  currency: Currency,
  amount: bigint,
  seq: number,
  ts: number,
): Promise<void> {
  const before = await vault.balanceOf('alice', currency);
  await vault.deposit('alice', currency, amount).signAndSubmit(alice);
  const after = await vault.balanceOf('alice', currency);
  events.push({ kind: 'deposit', depositor: 'alice', currency, amount, shares: after - before, seq, ts });
}

const unwrap = <T>(r: Result<T>): T => {
  if (!r.ok) throw new Error(`expected ok, got ${r.code}: ${r.error}`);
  return r.value;
};

describe('EH-U6 — earnings end-to-end against the mock vault', () => {
  it('blends a yielding bucket to USD and reports earned = real yield', async () => {
    const vault = new MockVaultClient();
    const store = new InMemorySnapshotStore();
    const events: VaultEvent[] = [];
    let now = Date.UTC(2026, 0, 15);
    const clock = () => now;

    await depositAndRecord(vault, events, 'USD', U(1000), 1, Date.UTC(2026, 0, 1));
    await snapshotTick(vault, store, clock, CURRENCIES); // Jan: base price

    vault.simulateYield('USD', U(200)); // pool returns accrue into NAV
    now = Date.UTC(2026, 1, 15);
    await snapshotTick(vault, store, clock, CURRENCIES); // Feb: price up

    const view = unwrap(await getEarnings('alice', { vault, events, snapshots: store, fx: okFx() }));

    expect(view.hasDeposit).toBe(true);
    // Balance ~= current NAV value of alice's shares (1000 shares × ~1.1998).
    expect(view.balanceUsd).toBeGreaterThan(1190);
    expect(view.balanceUsd).toBeLessThanOrEqual(1200);
    // Earned ~= 200 injected yield (minus a stroop of virtual-offset rounding).
    expect(view.earnedUsd).toBeGreaterThan(195);
    expect(view.earnedUsd).toBeLessThanOrEqual(200);
    // Timeline rises from ~0 (Jan) to ~200 (Feb).
    expect(view.chart).toHaveLength(2);
    expect(view.chart[0]?.earnedUsd).toBeCloseTo(0, 4);
    expect(view.chart[1]?.earnedUsd).toBeGreaterThan(195);
    expect(view.monthly.map((m) => m.label)).toEqual(['2026-01', '2026-02']);
  });

  it('is read-only: computing the view never moves funds', async () => {
    const vault = new MockVaultClient();
    const events: VaultEvent[] = [];
    await depositAndRecord(vault, events, 'USD', 1000n, 1, Date.UTC(2026, 0, 1));
    const before = await vault.balanceOf('alice', 'USD');

    await getEarnings('alice', { vault, events, snapshots: new InMemorySnapshotStore(), fx: okFx() });

    expect(await vault.balanceOf('alice', 'USD')).toBe(before);
  });

  it('a rising FX rate lifts the blended balance but not earned (AE1)', async () => {
    const vault = new MockVaultClient();
    const events: VaultEvent[] = [];
    await depositAndRecord(vault, events, 'EUR', 100n, 1, Date.UTC(2026, 0, 1)); // no yield

    const low = unwrap(
      await getEarnings('alice', { vault, events, snapshots: new InMemorySnapshotStore(), fx: okFx({ EUR: 1.14 }) }),
    );
    const high = unwrap(
      await getEarnings('alice', { vault, events, snapshots: new InMemorySnapshotStore(), fx: okFx({ EUR: 1.16 }) }),
    );

    expect(high.balanceUsd).toBeGreaterThan(low.balanceUsd);
    expect(low.earnedUsd).toBeCloseTo(0, 6);
    expect(high.earnedUsd).toBeCloseTo(0, 6);
  });

  it('blends multiple buckets for display without converting funds', async () => {
    const vault = new MockVaultClient();
    const events: VaultEvent[] = [];
    await depositAndRecord(vault, events, 'USD', U(100), 1, Date.UTC(2026, 0, 1));
    await depositAndRecord(vault, events, 'EUR', U(100), 2, Date.UTC(2026, 0, 1));

    const view = unwrap(
      await getEarnings('alice', { vault, events, snapshots: new InMemorySnapshotStore(), fx: okFx({ EUR: 1.14 }) }),
    );

    expect(view.balanceUsd).toBeCloseTo(214, 6);
    // Funds are untouched per bucket — the native balances (in base units) still stand alone.
    expect(await vault.balanceOf('alice', 'USD')).toBe(U(100));
    expect(await vault.balanceOf('alice', 'EUR')).toBe(U(100));
  });

  it('a mid-period deposit does not inflate that period earned', async () => {
    const vault = new MockVaultClient();
    const store = new InMemorySnapshotStore();
    const events: VaultEvent[] = [];
    let now = Date.UTC(2026, 0, 1);
    const clock = () => now;

    await depositAndRecord(vault, events, 'USD', U(1000), 1, now);
    vault.simulateYield('USD', U(200)); // NAV up before the window

    now = Date.UTC(2026, 1, 5);
    await snapshotTick(vault, store, clock, CURRENCIES); // before the mid-period deposit

    await depositAndRecord(vault, events, 'USD', U(500), 2, Date.UTC(2026, 1, 10)); // buys in at current NAV

    now = Date.UTC(2026, 1, 15);
    await snapshotTick(vault, store, clock, CURRENCIES); // after the deposit (same NAV)

    const view = unwrap(await getEarnings('alice', { vault, events, snapshots: store, fx: okFx() }));

    const [before, after] = view.chart;
    // The 500 deposit adds value AND contributions equally → earned barely moves (not toward +500).
    expect(Math.abs((after?.earnedUsd ?? 0) - (before?.earnedUsd ?? 0))).toBeLessThanOrEqual(2);
    expect(after?.earnedUsd).toBeGreaterThan(195);
  });
});
