import { describe, expect, it } from 'vitest';
import type { Address, Currency } from '@sorosense/vault-client';

import { ok, err } from '../lib/result.js';
import { InMemorySnapshotStore, type Snapshot } from '../earnings/snapshotter.js';
import type { VaultEvent } from '../earnings/cost-basis.js';
import { getEarnings, type EarningsDeps, type FxSource } from './earnings.js';

const USER: Address = 'alice';
const SCALE = 1_000_000_000n; // SHARE_PRICE_SCALE

/** Vault stub returning fixed per-bucket asset values (this surface only reads `assetValueOf`). */
const stubVault = (values: Partial<Record<Currency, bigint>>) => ({
  assetValueOf: async (_u: Address, c: Currency) => values[c] ?? 0n,
});

/** FX stub: USD (and unspecified buckets) default to 1; others take the map value. */
const okFx = (map: Partial<Record<Currency, number>> = {}): FxSource => async (c) => ok(map[c] ?? 1);

const store = (snaps: Snapshot[]): InMemorySnapshotStore => {
  const s = new InMemorySnapshotStore();
  for (const x of snaps) s.append(x);
  return s;
};

const dep = (currency: Currency, amount: bigint, shares: bigint, seq: number, ts = 0): VaultEvent => ({
  kind: 'deposit',
  depositor: USER,
  currency,
  amount,
  shares,
  seq,
  ts,
});

const deps = (over: Partial<EarningsDeps> & Pick<EarningsDeps, 'vault' | 'fx'>): EarningsDeps => ({
  events: [],
  snapshots: new InMemorySnapshotStore(),
  ...over,
});

describe('getEarnings — Earn 2-state (AE2)', () => {
  it('reports no deposit and zero balance for an empty user', async () => {
    const res = await getEarnings(USER, deps({ vault: stubVault({}), fx: okFx() }));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.hasDeposit).toBe(false);
    expect(res.value.balanceUsd).toBe(0);
  });

  it('reports a deposit once a bucket holds value', async () => {
    const res = await getEarnings(USER, deps({ vault: stubVault({ USD: 100n }), fx: okFx() }));
    expect(res.ok && res.value.hasDeposit).toBe(true);
  });
});

describe('getEarnings — blended-USD balance + drill-down (R3, R4)', () => {
  it('blends buckets to USD and the drill-down sums to the headline', async () => {
    const res = await getEarnings(
      USER,
      deps({ vault: stubVault({ USD: 100n, EUR: 100n }), fx: okFx({ EUR: 1.14 }) }),
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // 100 USD × 1 + 100 EUR × 1.14 = 214
    expect(res.value.balanceUsd).toBeCloseTo(214, 6);
    const eur = res.value.buckets.find((b) => b.currency === 'EUR');
    expect(eur?.usdValue).toBeCloseTo(114, 6);
    const sum = res.value.buckets.reduce((a, b) => a + b.usdValue, 0);
    expect(sum).toBeCloseTo(res.value.balanceUsd, 6);
  });
});

describe('getEarnings — FX is display-only, never earnings (AE1, R6, R7)', () => {
  it('a rising EUR/USD lifts the balance but leaves earned flat when yield is zero', async () => {
    const base = { vault: stubVault({ EUR: 100n }), events: [dep('EUR', 100n, 100n, 1)] };

    const low = await getEarnings(USER, deps({ ...base, fx: okFx({ EUR: 1.14 }) }));
    const high = await getEarnings(USER, deps({ ...base, fx: okFx({ EUR: 1.16 }) }));
    expect(low.ok && high.ok).toBe(true);
    if (!low.ok || !high.ok) return;

    expect(high.value.balanceUsd).toBeGreaterThan(low.value.balanceUsd); // FX lifts display balance
    expect(low.value.earnedUsd).toBeCloseTo(0, 6); // no yield → no earnings
    expect(high.value.earnedUsd).toBeCloseTo(0, 6); // FX move is NOT earnings
  });

  it('counts real yield as earned (value − contributions)', async () => {
    const res = await getEarnings(
      USER,
      deps({ vault: stubVault({ USD: 1199n }), events: [dep('USD', 1000n, 1000n, 1)], fx: okFx() }),
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.earnedUsd).toBeCloseTo(199, 6); // 1199 value − 1000 contributed
  });
});

describe('getEarnings — blended APY (R5)', () => {
  it('value-weights each bucket APY', async () => {
    const res = await getEarnings(
      USER,
      deps({ vault: stubVault({ USD: 100n, EUR: 100n }), fx: okFx() }),
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // best Safe APY: USD 8.59 (defindex), EUR 5.1 (blend-eurc); equal USD weights → mean 6.845
    expect(res.value.apy).toBeCloseTo((8.59 + 5.1) / 2, 6);
  });
});

describe('getEarnings — chart + monthly breakdown (AE3, R8, R9)', () => {
  it('produces per-month earned deltas from the price series', async () => {
    const jan1 = Date.UTC(2026, 0, 1);
    const jan15 = Date.UTC(2026, 0, 15);
    const feb15 = Date.UTC(2026, 1, 15);
    const res = await getEarnings(
      USER,
      deps({
        vault: stubVault({ USD: 1100n }),
        events: [dep('USD', 1000n, 1000n, 1, jan1)],
        // Jan: base price (no yield). Feb: price up 10%.
        snapshots: store([
          { currency: 'USD', price: SCALE, ts: jan15 },
          { currency: 'USD', price: (SCALE * 11n) / 10n, ts: feb15 },
        ]),
        fx: okFx(),
      }),
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.chart).toHaveLength(2);
    expect(res.value.monthly.map((m) => m.label)).toEqual(['2026-01', '2026-02']);
    expect(res.value.monthly[0]?.earnedUsd).toBeCloseTo(0, 6); // no yield in Jan
    expect(res.value.monthly[1]?.earnedUsd).toBeCloseTo(100, 6); // 1000 shares × 10% = 100
  });

  it('a mid-period deposit does not inflate that period earned', async () => {
    const feb5 = Date.UTC(2026, 1, 5);
    const feb10 = Date.UTC(2026, 1, 10);
    const feb15 = Date.UTC(2026, 1, 15);
    const price = (SCALE * 11n) / 10n; // steady 1.1 across the window
    const res = await getEarnings(
      USER,
      deps({
        vault: stubVault({ USD: 1599n }),
        events: [
          dep('USD', 1000n, 1000n, 1, Date.UTC(2026, 0, 1)),
          dep('USD', 500n, 454n, 2, feb10), // buys in at ~1.1 → adds ~0 earned
        ],
        snapshots: store([
          { currency: 'USD', price, ts: feb5 },
          { currency: 'USD', price, ts: feb15 },
        ]),
        fx: okFx(),
      }),
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const [before, after] = res.value.chart;
    // Earned is ~unchanged by the deposit (both ≈ 100), NOT inflated toward the 500 deposited.
    expect(Math.abs((after?.earnedUsd ?? 0) - (before?.earnedUsd ?? 0))).toBeLessThanOrEqual(2);
    expect(after?.earnedUsd).toBeGreaterThan(90);
    expect(after?.earnedUsd).toBeLessThan(110);
  });
});

describe('getEarnings — invariants', () => {
  it('exposes NO risk/label/score field anywhere (R14)', async () => {
    const res = await getEarnings(USER, deps({ vault: stubVault({ USD: 100n }), fx: okFx() }));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const forbidden = ['risk', 'riskLabel', 'label', 'safe', 'score', 'tier'];
    const view = res.value as unknown as Record<string, unknown>;
    for (const key of forbidden) expect(key in view).toBe(false);
    const bucket = res.value.buckets[0] as unknown as Record<string, unknown>;
    for (const key of forbidden) expect(key in bucket).toBe(false);
  });

  it('surfaces a failed FX read as a typed error, never a silent $0', async () => {
    const failingFx: FxSource = async (c) => (c === 'EUR' ? err('unavailable', 'reflector down') : ok(1));
    const res = await getEarnings(
      USER,
      deps({ vault: stubVault({ USD: 100n, EUR: 100n }), fx: failingFx }),
    );
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe('unavailable');
  });
});
