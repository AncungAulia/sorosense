/**
 * Global per-currency share-price snapshotter (R8, R9, R10). The chart and per-month breakdown need a time
 * series of NAV-per-share, but the contract only exposes the *current* `sharePrice(currency)`. This
 * module samples that read on each scheduler tick and records the global per-bucket price series so
 * later surfaces have history to chart and bucket.
 *
 * Scope: the price series is user-agnostic — no shares, no per-user attribution. A later unit joins a
 * user's share timeline against this price series to compute what they earned; that math is NOT here.
 *
 * Determinism: the module core never reads the wall clock. Timestamps come from an injected
 * `clock: () => number` so ticks are reproducible and tests can drive time. Prices are `bigint`
 * ({@link PriceRay}, scaled by `SHARE_PRICE_SCALE`) to avoid float drift.
 */

import type { Currency, PriceRay } from '@sorosense/vault-client';

/** One recorded price sample for a currency bucket, stamped with the tick's clock value. */
export interface Snapshot {
  currency: Currency;
  price: PriceRay;
  ts: number;
}

export interface SnapshotStore {
  /** Record a snapshot. Ticks stamp `ts` from an increasing clock, so appends are monotonic. */
  append(s: Snapshot): void;
  /** Snapshots for a currency, ascending by ts (insertion order is monotonic). */
  series(currency: Currency): Snapshot[];
}

/**
 * In-memory price series. Ordering is insertion order, which is monotonic in ts because ticks stamp
 * from a non-decreasing clock — so the feed is deterministic for a given sequence of appends. Buckets
 * are kept per currency and never mixed. Swap for a durable store at deploy alongside the allocator's
 * store; the interface is the seam.
 */
export class InMemorySnapshotStore implements SnapshotStore {
  private readonly byCurrency = new Map<Currency, Snapshot[]>();

  append(s: Snapshot): void {
    const list = this.byCurrency.get(s.currency) ?? [];
    list.push(s);
    this.byCurrency.set(s.currency, list);
  }

  series(currency: Currency): Snapshot[] {
    // Copy so callers cannot mutate the stored series. Empty bucket → empty array.
    return [...(this.byCurrency.get(currency) ?? [])];
  }
}

/** Minimal price source — the vault seam's read surface, narrowed to what a tick needs. */
export interface PriceSource {
  sharePrice(currency: Currency): Promise<PriceRay>;
}

/** Injected time source (ms since epoch). Passed in so the core never calls `Date.now()`. */
export type Clock = () => number;

/**
 * One snapshot tick: read `sharePrice` for each currency and append a snapshot stamped with `clock()`.
 * Usable as a scheduler handler (`backend/src/scheduler/cron.ts`) — bind the args and pass it to
 * `runOnce` / `startScheduler`. Reads are awaited per currency; the clock is sampled once per read so
 * the timestamp reflects when that price was taken.
 */
export async function snapshotTick(
  source: PriceSource,
  store: SnapshotStore,
  clock: Clock,
  currencies: readonly Currency[],
): Promise<void> {
  for (const currency of currencies) {
    const price = await source.sharePrice(currency);
    store.append({ currency, price, ts: clock() });
  }
}

export type Granularity = 'day' | 'week' | 'month' | 'year';

/** A calendar bucket: its start timestamp (UTC) and the last price observed within it. */
export interface Bucket {
  bucketTs: number;
  price: PriceRay;
}

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

/**
 * Start-of-period timestamp (UTC) for a snapshot's ts under a given granularity.
 *  - day:   UTC midnight of the calendar date.
 *  - week:  fixed 7-day windows anchored at the Unix epoch (1970-01-01, a Thursday). Chosen over ISO
 *           weeks for a simpler, boundary-stable key; weeks run Thu→Wed.
 *  - month: first instant of the UTC year+month.
 *  - year:  first instant of the UTC year.
 */
function bucketStart(ts: number, g: Granularity): number {
  switch (g) {
    case 'day':
      return Math.floor(ts / DAY_MS) * DAY_MS;
    case 'week':
      return Math.floor(ts / WEEK_MS) * WEEK_MS;
    case 'month': {
      const d = new Date(ts);
      return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
    }
    case 'year': {
      const d = new Date(ts);
      return Date.UTC(d.getUTCFullYear(), 0, 1);
    }
  }
}

/**
 * Group a currency's series into calendar buckets, each carrying the LAST (most recent) price in that
 * period. Robust to input order: buckets key on the period start and keep the snapshot with the
 * greatest ts. Returns buckets ascending by `bucketTs`; an empty series yields an empty array.
 */
export function bucketSeries(series: Snapshot[], g: Granularity): Bucket[] {
  // Per bucket, retain the snapshot with the newest ts so `price` is the period's last observation.
  const latest = new Map<number, Snapshot>();
  for (const s of series) {
    const key = bucketStart(s.ts, g);
    const held = latest.get(key);
    if (!held || s.ts >= held.ts) latest.set(key, s);
  }

  return [...latest.entries()]
    .sort(([a], [b]) => a - b)
    .map(([bucketTs, s]) => ({ bucketTs, price: s.price }));
}
