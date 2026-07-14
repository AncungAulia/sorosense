import { describe, expect, it } from 'vitest';
import type { Address, Currency } from '@sorosense/vault-client';

import { ok, err } from '../lib/result.js';
import { InMemorySnapshotStore, type Snapshot } from '../earnings/snapshotter.js';
import type { VaultEvent } from '../earnings/cost-basis.js';
import { getEarnings, type ChartPoint, type EarningsDeps, type FxSource } from './earnings.js';

const USER: Address = 'alice';
const SCALE = 1_000_000_000n; // SHARE_PRICE_SCALE
const UNIT = 10_000_000n; // 7-dp stablecoin base unit (mirrors earnings.ts / holdings.ts)
/** Whole currency units → native 7-dp base units, so USD assertions read at human scale. */
const U = (units: bigint): bigint => units * UNIT;

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

const wd = (currency: Currency, amount: bigint, shares: bigint, seq: number, ts = 0): VaultEvent => ({
  kind: 'withdraw',
  depositor: USER,
  currency,
  amount,
  shares,
  seq,
  ts,
});

/** The chart point at exactly `ts` (the timeline samples every event and snapshot timestamp). */
const at = (chart: readonly ChartPoint[], ts: number): ChartPoint | undefined =>
  chart.find((p) => p.ts === ts);

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
      deps({ vault: stubVault({ USD: U(100n), EUR: U(100n) }), fx: okFx({ EUR: 1.14 }) }),
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // 100 USD × 1 + 100 EUR × 1.14 = 214 (values are 7-dp base units, normalized ÷UNIT before FX)
    expect(res.value.balanceUsd).toBeCloseTo(214, 6);
    const eur = res.value.buckets.find((b) => b.currency === 'EUR');
    expect(eur?.usdValue).toBeCloseTo(114, 6);
    const sum = res.value.buckets.reduce((a, b) => a + b.usdValue, 0);
    expect(sum).toBeCloseTo(res.value.balanceUsd, 6);
  });
});

describe('getEarnings — ÷UNIT scaling (U3): native 7-dp amounts convert to human-scale USD', () => {
  it('a 1000-unit bucket (1_000_0000000n at 1e7) × rate is ~1000×rate, not 1e7× it', async () => {
    // 1_000_0000000n = 1000.0 units at the 7-dp base scale (== U(1000n)).
    const nativeValue = 1_000_0000000n;
    const rate = 1.5; // e.g. an EUR/USD-style FX rate
    const res = await getEarnings(
      USER,
      deps({ vault: stubVault({ EUR: nativeValue }), fx: okFx({ EUR: rate }) }),
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // Human scale: 1000 units × 1.5 = 1500. The old `value × rate` (no ÷UNIT) would be 1.5e10.
    expect(res.value.balanceUsd).toBeCloseTo(1500, 6);
    const eur = res.value.buckets.find((b) => b.currency === 'EUR');
    expect(eur?.usdValue).toBeCloseTo(1500, 6);
    expect(eur?.nativeValue).toBe(nativeValue); // native amount is untouched, only display is normalized
    // Guard against a regression back to the 1e7×-too-large magnitude.
    expect(res.value.balanceUsd).toBeLessThan(1e6);
  });

  it('earned is normalized on the same ÷UNIT scale as value (yield stays human-scale)', async () => {
    const res = await getEarnings(
      USER,
      deps({
        vault: stubVault({ USD: U(1050n) }),
        events: [dep('USD', U(1000n), U(1000n), 1)],
        fx: okFx(),
      }),
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // 1050 value − 1000 contributed = 50 earned (both ÷UNIT), not 5e8.
    expect(res.value.earnedUsd).toBeCloseTo(50, 6);
    expect(res.value.earnedUsd).toBeLessThan(1e6);
  });
});

describe('getEarnings — FX is display-only, never earnings (AE1, R6, R7)', () => {
  it('a rising EUR/USD lifts the balance but leaves earned flat when yield is zero', async () => {
    const base = { vault: stubVault({ EUR: U(100n) }), events: [dep('EUR', U(100n), U(100n), 1)] };

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
      deps({ vault: stubVault({ USD: U(1199n) }), events: [dep('USD', U(1000n), U(1000n), 1)], fx: okFx() }),
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.earnedUsd).toBeCloseTo(199, 6); // 1199 value − 1000 contributed (÷UNIT normalized)
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
    // best Safe APY: USD 10 (sorosense-usd), EUR 10 (sorosense-eur); equal weights → mean 10
    expect(res.value.apy).toBeCloseTo((10 + 10) / 2, 6);
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
        vault: stubVault({ USD: U(1100n) }),
        events: [dep('USD', U(1000n), U(1000n), 1, jan1)],
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
    // Sampled at the union of event + snapshot timestamps: the deposit (jan1) plus both snapshots.
    expect(res.value.chart.map((p) => p.ts)).toEqual([jan1, jan15, feb15]);
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
        vault: stubVault({ USD: U(1599n) }),
        events: [
          dep('USD', U(1000n), U(1000n), 1, Date.UTC(2026, 0, 1)),
          dep('USD', U(500n), U(454n), 2, feb10), // buys in at ~1.1 → adds ~0 earned
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
    // Compare the snapshots either side of the deposit (the timeline also samples the deposit itself).
    const before = at(res.value.chart, feb5);
    const after = at(res.value.chart, feb15);
    // Earned is ~unchanged by the deposit (both ≈ 100), NOT inflated toward the 500 deposited.
    expect(Math.abs((after?.earnedUsd ?? 0) - (before?.earnedUsd ?? 0))).toBeLessThanOrEqual(2);
    expect(after?.earnedUsd).toBeGreaterThan(90);
    expect(after?.earnedUsd).toBeLessThan(110);
    // …while the value chart DOES step on the deposit: 1100 before → 1599.4 after (454 shares at 1.1).
    expect(before?.valueUsd).toBeCloseTo(1100, 6);
    expect(after?.valueUsd).toBeCloseTo(1599.4, 6);
  });
});

describe('getEarnings — value-over-time + per-bucket earned (U1b, R8, R10)', () => {
  const t0 = Date.UTC(2026, 2, 1); // deposit
  const t1 = Date.UTC(2026, 2, 2); // snapshot; this bucket has no accruing pool, so price is the scale
  const t2 = Date.UTC(2026, 2, 3); // second deposit / withdrawal

  it('a deposit is a real step in value with zero growth (the honest real-mode chart)', async () => {
    const res = await getEarnings(
      USER,
      deps({
        vault: stubVault({ USD: U(1000n) }),
        events: [dep('USD', U(1000n), U(1000n), 1, t0)],
        snapshots: store([{ currency: 'USD', price: SCALE, ts: t1 }]),
        fx: okFx(),
      }),
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    // The event time is sampled too, so the deposit is visible BEFORE the next snapshot tick.
    expect(res.value.chart.map((p) => p.ts)).toEqual([t0, t1]);
    expect(at(res.value.chart, t0)?.valueUsd).toBeCloseTo(1000, 6);
    expect(at(res.value.chart, t0)?.earnedUsd).toBeCloseTo(0, 6);
    // Flat from t0 to t1: the step is real, the growth is zero.
    expect(at(res.value.chart, t1)?.valueUsd).toBeCloseTo(1000, 6);
    expect(at(res.value.chart, t1)?.earnedUsd).toBeCloseTo(0, 6);
  });

  it('a second deposit steps value up and leaves earned at zero (a deposit is never profit)', async () => {
    const res = await getEarnings(
      USER,
      deps({
        vault: stubVault({ USD: U(1500n) }),
        events: [dep('USD', U(1000n), U(1000n), 1, t0), dep('USD', U(500n), U(500n), 2, t2)],
        snapshots: store([{ currency: 'USD', price: SCALE, ts: t1 }]),
        fx: okFx(),
      }),
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(at(res.value.chart, t0)?.valueUsd).toBeCloseTo(1000, 6);
    expect(at(res.value.chart, t2)?.valueUsd).toBeCloseTo(1500, 6); // steps up on the deposit
    expect(res.value.chart.every((p) => Math.abs(p.earnedUsd) < 1e-6)).toBe(true);
    expect(res.value.earnedUsd).toBeCloseTo(0, 6);
  });

  it('a withdrawal steps value down and leaves earned at zero', async () => {
    const res = await getEarnings(
      USER,
      deps({
        vault: stubVault({ USD: U(600n) }),
        events: [dep('USD', U(1000n), U(1000n), 1, t0), wd('USD', U(400n), U(400n), 2, t2)],
        snapshots: store([{ currency: 'USD', price: SCALE, ts: t1 }]),
        fx: okFx(),
      }),
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(at(res.value.chart, t0)?.valueUsd).toBeCloseTo(1000, 6);
    expect(at(res.value.chart, t2)?.valueUsd).toBeCloseTo(600, 6); // steps DOWN on the withdrawal
    expect(res.value.chart.every((p) => Math.abs(p.earnedUsd) < 1e-6)).toBe(true);
  });

  it('when the price rises, earned rises and value rises with it (forward-compat with NAV accrual)', async () => {
    const risen = (SCALE * 12n) / 10n; // +20% NAV per share — what U5 (mark-to-market) would produce
    const res = await getEarnings(
      USER,
      deps({
        vault: stubVault({ USD: U(1200n) }),
        events: [dep('USD', U(1000n), U(1000n), 1, t0)],
        snapshots: store([
          { currency: 'USD', price: SCALE, ts: t1 },
          { currency: 'USD', price: risen, ts: t2 },
        ]),
        fx: okFx(),
      }),
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const flat = at(res.value.chart, t1);
    const grown = at(res.value.chart, t2);
    expect(flat?.valueUsd).toBeCloseTo(1000, 6);
    expect(flat?.earnedUsd).toBeCloseTo(0, 6);
    expect(grown?.valueUsd).toBeCloseTo(1200, 6); // value follows the price
    expect(grown?.earnedUsd).toBeCloseTo(200, 6); // …and so does earned, one-for-one
  });

  it('per-bucket earnedUsd sums to the headline earnedUsd (R4)', async () => {
    const res = await getEarnings(
      USER,
      deps({
        vault: stubVault({ USD: U(1050n), EUR: U(220n) }),
        events: [dep('USD', U(1000n), U(1000n), 1, t0), dep('EUR', U(200n), U(200n), 2, t0)],
        fx: okFx({ EUR: 1.5 }),
      }),
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const usd = res.value.buckets.find((b) => b.currency === 'USD');
    const eur = res.value.buckets.find((b) => b.currency === 'EUR');
    expect(usd?.earnedUsd).toBeCloseTo(50, 6); // (1050 − 1000) × 1
    expect(eur?.earnedUsd).toBeCloseTo(30, 6); // (220 − 200) × 1.5 — native yield, then displayed in USD
    const sum = res.value.buckets.reduce((a, b) => a + b.earnedUsd, 0);
    expect(sum).toBeCloseTo(res.value.earnedUsd, 6);
    expect(res.value.earnedUsd).toBeCloseTo(80, 6);
  });

  it('a fresh vault (no events, no snapshots) yields an empty chart, not a crash', async () => {
    const res = await getEarnings(USER, deps({ vault: stubVault({}), fx: okFx() }));
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.value.chart).toEqual([]);
    expect(res.value.monthly).toEqual([]);
    expect(res.value.earnedUsd).toBe(0);
    expect(res.value.hasDeposit).toBe(false);
    expect(res.value.buckets.every((b) => b.earnedUsd === 0)).toBe(true);
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

  it('needs no rate for an untouched bucket — an unpriceable MXN cannot 503 a funded USD view (U1c)', async () => {
    // The Reflector feed carries no MXN symbol, so its rate is permanently unavailable. A bucket with no
    // value and no history contributes 0 × rate = 0 to every figure, so the view must not ask for one.
    const asked: Currency[] = [];
    const fx: FxSource = async (c) => {
      asked.push(c);
      return c === 'MXN' ? err('unavailable', 'no Reflector symbol configured for MXN') : ok(1);
    };

    const res = await getEarnings(
      USER,
      deps({ vault: stubVault({ USD: U(100n) }), events: [dep('USD', U(100n), U(100n), 1)], fx }),
    );

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.balanceUsd).toBeCloseTo(100, 6);
    expect(asked).toEqual(['USD']); // EUR and MXN are untouched — neither was priced
    expect(res.value.buckets.find((b) => b.currency === 'MXN')?.usdValue).toBe(0);
  });

  it('still fails closed when the unpriceable bucket HOLDS money (fail-closed where it matters)', async () => {
    const fx: FxSource = async (c) =>
      c === 'MXN' ? err('unavailable', 'no Reflector symbol configured for MXN') : ok(1);

    const res = await getEarnings(USER, deps({ vault: stubVault({ USD: 100n, MXN: 100n }), fx }));

    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe('unavailable');
  });
});
