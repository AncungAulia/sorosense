/**
 * Chart + monthly fixture for the funded Earn screen. The frontend has no share-price time series —
 * `snapshotter.ts` lives only in the backend — so the SHAPE of the earned timeline is a fixture while
 * the headline figures are read live from the vault seam (see `hooks/useEarnings.ts`).
 *
 * Everything here is normalized to 0…1; `useEarnings` scales it by the live `earnedUsd` so the hero,
 * the chart's last point, and the sum of the monthly breakdown are the same number.
 *
 * `now` is injected rather than read, following the backend convention "pass a `clock: () => number`".
 * Types mirror `backend/src/api/earnings.ts` but are declared locally: the frontend must not import
 * from `backend`.
 */

/** One point on the cumulative-earned timeline. `earnedUsd` is normalized 0…1. */
export interface ChartPoint {
  ts: number;
  earnedUsd: number;
}

/** Earned during one calendar month (UTC). `label` is `YYYY-MM`; `earnedUsd` is normalized 0…1. */
export interface MonthlyEarned {
  label: string;
  earnedUsd: number;
}

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

export function buildEarningsFixture(now: number): { chart: ChartPoint[]; monthly: MonthlyEarned[] } {
  // Month boundaries, oldest→newest. `starts[MONTHS - 1]` is the start of the current month.
  const starts = Array.from({ length: MONTHS }, (_, i) => monthStart(now, MONTHS - 1 - i));
  const ends = starts.map((s, i) => starts[i + 1] ?? now);

  // The current month is prorated by how much of it has elapsed — "This month" is a partial month.
  const currentStart = starts[MONTHS - 1]!;
  const currentFullEnd = monthStart(now, -1); // start of next month
  const elapsed = (now - currentStart) / (currentFullEnd - currentStart);
  const raw = MONTH_WEIGHTS.map((w, i) => (i === MONTHS - 1 ? w * elapsed : w));
  const total = raw.reduce((s, w) => s + w, 0);
  const monthly: MonthlyEarned[] = raw.map((w, i) => ({ label: monthLabel(starts[i]!), earnedUsd: w / total }));

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

  const chart: ChartPoint[] = [];
  const fineStart = now - FINE_WINDOW;
  for (let ts = starts[0]!; ts < fineStart; ts += DAY) chart.push({ ts, earnedUsd: earnedAt(ts) });
  for (let ts = fineStart; ts < now; ts += HOUR) chart.push({ ts, earnedUsd: earnedAt(ts) });
  chart.push({ ts: now, earnedUsd: earnedAt(now) });

  return { chart, monthly };
}
