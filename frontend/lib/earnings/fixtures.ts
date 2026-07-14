/**
 * **OFFLINE-FALLBACK ONLY (R11).** Chart + monthly fixture for the funded Earn screen when the backend
 * is not configured, or its read failed. In real mode `GET /earnings` supplies both series from chain
 * events and the share-price snapshots, and nothing here is reached — do not import it into a component
 * (go through `hooks/useEarnings.ts`, or the backend can no longer correct that surface).
 *
 * It exists because the frontend has no share-price time series of its own: `snapshotter.ts` lives only
 * in the backend. So offline, the SHAPE of the timeline is a fixture while the headline figures are read
 * live from the vault seam (which, being the mock, genuinely accrues via `simulateYield`).
 *
 * **Scale, and why value is not a second curve.** The fixture's own arithmetic is normalized 0…1; a
 * caller passes the live `{ balanceUsd, earnedUsd }` and gets absolute USD points back. Value is then
 * not an independent series — it is `principal + earned(t)`, with `principal = balanceUsd − earnedUsd`
 * held constant across the window (offline there is no deposit history to step on). One curve, two
 * consistent readings: the chart's last point, the hero, and the monthly sum are the same number by
 * construction. The default scale reproduces the plain normalized series.
 *
 * `now` is injected rather than read, following the backend convention "pass a `clock: () => number`".
 * The point types come from `lib/api/types.ts` — the same shape the backend sends — so **one chart
 * component feeds from both modes** and a fixture can never drift into a shape the real response cannot
 * produce.
 */

import type { ChartPoint, MonthlyEarned } from "../api/types";

export type { ChartPoint, MonthlyEarned };

/** The live figures the normalized fixture is stretched onto. */
export interface EarningsScale {
  /** Current blended-USD balance — the value the last chart point must land on. */
  balanceUsd: number;
  /** Current total earned (USD) — the height the cumulative-earned curve must reach. */
  earnedUsd: number;
}

/** Scale-free default: the series come back in their raw 0…1 form (earned ends at 1, monthly sums to 1). */
const NORMALIZED: EarningsScale = { balanceUsd: 1, earnedUsd: 1 };

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const MONTHS = 9;
/** Relative earnings weight per month, oldest→newest. Arbitrary but fixed, so runs are comparable. */
const MONTH_WEIGHTS = [0.7, 1.2, 0.9, 1.1, 1.3, 1.0, 1.25, 1.15, 0.55] as const;
/** Hourly resolution over this trailing window; daily before it. */
const FINE_WINDOW = 7 * DAY;

function monthLabel(ts: number): string {
  const d = new Date(ts);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** UTC start-of-month for the month `back` months before `now`. */
function monthStart(now: number, back: number): number {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - back, 1);
}

export function buildEarningsFixture(
  now: number,
  scale: EarningsScale = NORMALIZED,
): { chart: ChartPoint[]; monthly: MonthlyEarned[] } {
  // Month boundaries, oldest→newest. `starts[MONTHS - 1]` is the start of the current month.
  const starts = Array.from({ length: MONTHS }, (_, i) => monthStart(now, MONTHS - 1 - i));
  const ends = starts.map((s, i) => starts[i + 1] ?? now);

  // The current month is prorated by how much of it has elapsed — "This month" is a partial month.
  const currentStart = starts[MONTHS - 1]!;
  const currentFullEnd = monthStart(now, -1); // start of next month
  const elapsed = (now - currentStart) / (currentFullEnd - currentStart);
  const raw = MONTH_WEIGHTS.map((w, i) => (i === MONTHS - 1 ? w * elapsed : w));
  const total = raw.reduce((s, w) => s + w, 0);
  const monthly: MonthlyEarned[] = raw.map((w, i) => ({
    label: monthLabel(starts[i]!),
    earnedUsd: (w / total) * scale.earnedUsd,
  }));

  // Cumulative earned at `ts`: every completed month's weight, plus a linear slice of the month `ts`
  // falls in. Piecewise-linear within a month keeps the curve monotone and makes the chart's last
  // point land exactly on the sum of `monthly`.
  const cumulativeBefore: number[] = [];
  let acc = 0;
  for (const m of monthly) {
    cumulativeBefore.push(acc);
    acc += m.earnedUsd;
  }
  const earnedAt = (ts: number): number => {
    if (ts <= starts[0]!) return 0;
    for (let i = MONTHS - 1; i >= 0; i--) {
      const start = starts[i]!;
      if (ts < start) continue;
      const end = ends[i]!;
      const frac = end > start ? Math.min(1, (ts - start) / (end - start)) : 1;
      return cumulativeBefore[i]! + monthly[i]!.earnedUsd * frac;
    }
    return 0;
  };

  // Offline the vault has no deposit history to step on, so value moves only as earnings accrue:
  // `value(t) = principal + earned(t)`, landing exactly on `balanceUsd` at `now`. (In real mode this
  // is the other way round — value steps on deposits and earned is flat at zero. Same shape, opposite
  // motion, and both honest about their own source.)
  const principal = scale.balanceUsd - scale.earnedUsd;
  const pointAt = (ts: number): ChartPoint => {
    const earnedUsd = earnedAt(ts);
    return { ts, valueUsd: principal + earnedUsd, earnedUsd };
  };

  const chart: ChartPoint[] = [];
  const fineStart = now - FINE_WINDOW;
  for (let ts = starts[0]!; ts < fineStart; ts += DAY) chart.push(pointAt(ts));
  for (let ts = fineStart; ts < now; ts += HOUR) chart.push(pointAt(ts));
  chart.push(pointAt(now));

  return { chart, monthly };
}
