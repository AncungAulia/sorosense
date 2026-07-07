import { describe, expect, it } from 'vitest';
import type { Currency, PriceRay } from '@sorosense/vault-client';
import { SHARE_PRICE_SCALE } from '@sorosense/vault-client';
import {
  bucketSeries,
  InMemorySnapshotStore,
  snapshotTick,
  type PriceSource,
} from './snapshotter.js';

const CURRENCIES: readonly Currency[] = ['USD', 'EUR', 'MXN'];

/** A fake price source: returns a fixed price per currency, or a rising price if a ramp is given. */
function fakeSource(prices: Record<Currency, PriceRay>, rampPerCall = 0n): PriceSource {
  const calls = new Map<Currency, number>();
  return {
    async sharePrice(currency: Currency): Promise<PriceRay> {
      const n = calls.get(currency) ?? 0;
      calls.set(currency, n + 1);
      return prices[currency] + rampPerCall * BigInt(n);
    },
  };
}

/** A fake clock that returns a fixed value and can be advanced between ticks (no wall clock). */
function fakeClock(start: number) {
  let now = start;
  return { clock: () => now, advance: (ms: number) => (now += ms) };
}

describe('snapshotTick', () => {
  it('appends one snapshot per currency, stamped with the clock value', async () => {
    const store = new InMemorySnapshotStore();
    const source = fakeSource({ USD: SHARE_PRICE_SCALE, EUR: 2n * SHARE_PRICE_SCALE, MXN: 3n * SHARE_PRICE_SCALE });
    const t = fakeClock(1_000);

    await snapshotTick(source, store, t.clock, CURRENCIES);

    expect(store.series('USD')).toEqual([{ currency: 'USD', price: SHARE_PRICE_SCALE, ts: 1_000 }]);
    expect(store.series('EUR')[0]?.price).toBe(2n * SHARE_PRICE_SCALE);
    expect(store.series('MXN')).toHaveLength(1);
  });

  it('records a rising price across successive ticks', async () => {
    const store = new InMemorySnapshotStore();
    const source = fakeSource({ USD: SHARE_PRICE_SCALE, EUR: SHARE_PRICE_SCALE, MXN: SHARE_PRICE_SCALE }, 5n);
    const t = fakeClock(0);

    await snapshotTick(source, store, t.clock, ['USD']);
    await snapshotTick(source, store, t.clock, ['USD']);

    expect(store.series('USD').map((s) => s.price)).toEqual([SHARE_PRICE_SCALE, SHARE_PRICE_SCALE + 5n]);
  });
});

describe('InMemorySnapshotStore.series', () => {
  it('returns snapshots ascending by ts', () => {
    const store = new InMemorySnapshotStore();
    store.append({ currency: 'USD', price: 1n, ts: 10 });
    store.append({ currency: 'USD', price: 2n, ts: 20 });
    store.append({ currency: 'USD', price: 3n, ts: 30 });

    expect(store.series('USD').map((s) => s.ts)).toEqual([10, 20, 30]);
  });

  it('returns an empty array for a currency with no snapshots', () => {
    expect(new InMemorySnapshotStore().series('EUR')).toEqual([]);
  });

  it('hands back a copy so callers cannot mutate the stored series', () => {
    const store = new InMemorySnapshotStore();
    store.append({ currency: 'USD', price: 1n, ts: 10 });
    store.series('USD').push({ currency: 'USD', price: 99n, ts: 99 });
    expect(store.series('USD')).toHaveLength(1);
  });
});

describe('bucketSeries', () => {
  // Anchor timestamps at known UTC instants.
  const jan1 = Date.UTC(2026, 0, 1); // 2026-01-01T00:00:00Z
  const HOUR = 3_600_000;
  const DAY = 86_400_000;

  it('returns an empty array for an empty series', () => {
    expect(bucketSeries([], 'day')).toEqual([]);
  });

  it('Day: groups by UTC date and carries the last price in each day', () => {
    const series = [
      { currency: 'USD' as Currency, price: 10n, ts: jan1 + 1 * HOUR }, // Jan 1
      { currency: 'USD' as Currency, price: 11n, ts: jan1 + 5 * HOUR }, // Jan 1 (later → wins)
      { currency: 'USD' as Currency, price: 20n, ts: jan1 + DAY + 2 * HOUR }, // Jan 2
    ];
    expect(bucketSeries(series, 'day')).toEqual([
      { bucketTs: jan1, price: 11n },
      { bucketTs: jan1 + DAY, price: 20n },
    ]);
  });

  it('Month: groups by UTC year+month and carries the last price in each month', () => {
    const feb1 = Date.UTC(2026, 1, 1);
    const series = [
      { currency: 'USD' as Currency, price: 10n, ts: jan1 + 2 * DAY }, // Jan
      { currency: 'USD' as Currency, price: 15n, ts: jan1 + 20 * DAY }, // Jan (later → wins)
      { currency: 'USD' as Currency, price: 30n, ts: feb1 + 3 * DAY }, // Feb
    ];
    expect(bucketSeries(series, 'month')).toEqual([
      { bucketTs: jan1, price: 15n },
      { bucketTs: feb1, price: 30n },
    ]);
  });

  it('Week: groups into 7-day epoch-anchored windows', () => {
    const series = [
      { currency: 'USD' as Currency, price: 10n, ts: jan1 }, // some week W
      { currency: 'USD' as Currency, price: 11n, ts: jan1 + 3 * DAY }, // same week W (later)
      { currency: 'USD' as Currency, price: 20n, ts: jan1 + 8 * DAY }, // next week W+1
    ];
    const buckets = bucketSeries(series, 'week');
    expect(buckets).toHaveLength(2);
    expect(buckets[0]?.price).toBe(11n);
    expect(buckets[1]?.price).toBe(20n);
    expect(buckets[1]!.bucketTs - buckets[0]!.bucketTs).toBe(7 * DAY);
  });

  it('Year: groups by UTC year', () => {
    const y2025 = Date.UTC(2025, 6, 1);
    const series = [
      { currency: 'USD' as Currency, price: 5n, ts: y2025 },
      { currency: 'USD' as Currency, price: 6n, ts: jan1 + 100 * DAY }, // 2026
    ];
    expect(bucketSeries(series, 'year')).toEqual([
      { bucketTs: Date.UTC(2025, 0, 1), price: 5n },
      { bucketTs: Date.UTC(2026, 0, 1), price: 6n },
    ]);
  });

  it('keeps the last price regardless of input order', () => {
    const series = [
      { currency: 'USD' as Currency, price: 11n, ts: jan1 + 5 * HOUR }, // later, listed first
      { currency: 'USD' as Currency, price: 10n, ts: jan1 + 1 * HOUR },
    ];
    expect(bucketSeries(series, 'day')).toEqual([{ bucketTs: jan1, price: 11n }]);
  });
});

describe('injected clock drives timestamps (no wall clock)', () => {
  it('stamps each tick with the advancing fake clock', async () => {
    const store = new InMemorySnapshotStore();
    const source = fakeSource({ USD: SHARE_PRICE_SCALE, EUR: SHARE_PRICE_SCALE, MXN: SHARE_PRICE_SCALE });
    const t = fakeClock(1_000);

    await snapshotTick(source, store, t.clock, ['USD']);
    t.advance(60_000);
    await snapshotTick(source, store, t.clock, ['USD']);
    t.advance(60_000);
    await snapshotTick(source, store, t.clock, ['USD']);

    expect(store.series('USD').map((s) => s.ts)).toEqual([1_000, 61_000, 121_000]);
  });
});

describe('per-currency independence', () => {
  it('keeps series and buckets separate per currency', async () => {
    const store = new InMemorySnapshotStore();
    const source = fakeSource({ USD: 100n, EUR: 200n, MXN: 300n });
    const t = fakeClock(Date.UTC(2026, 0, 1));

    await snapshotTick(source, store, t.clock, CURRENCIES);
    t.advance(86_400_000); // next day
    await snapshotTick(source, store, t.clock, CURRENCIES);

    expect(store.series('USD').every((s) => s.currency === 'USD')).toBe(true);
    expect(store.series('EUR').every((s) => s.currency === 'EUR')).toBe(true);

    expect(bucketSeries(store.series('USD'), 'day').map((b) => b.price)).toEqual([100n, 100n]);
    expect(bucketSeries(store.series('EUR'), 'day').map((b) => b.price)).toEqual([200n, 200n]);
    expect(bucketSeries(store.series('MXN'), 'day')).toHaveLength(2);
  });
});
