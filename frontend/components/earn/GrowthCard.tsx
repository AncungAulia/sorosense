"use client";
import { useState } from "react";
import { Card, Segmented } from "../ui";
import { Bars } from "./Bars";
import { MonthlyBreakdown } from "./MonthlyBreakdown";
import type { ChartPoint, MonthlyEarned } from "../../hooks/useEarnings";
import type { PeriodName } from "../../lib/earn/simulate";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const PERIODS: readonly PeriodName[] = ["day", "week", "month", "year"];
/** Capitalized in the DOM: CSS `capitalize` does not change a button's accessible name. */
const PERIOD_LABEL: Record<PeriodName, string> = { day: "Day", week: "Week", month: "Month", year: "Year" };

/**
 * A FIXED calendar window + bar count per period, so the four tabs are genuinely distinct charts — not
 * the same data re-binned. Day is the last 24 hours by hour, Week the last 7 days by day, Month the last
 * 30 days by day, Year the last 12 months by month. (Previously Month and Year both clamped to the first
 * data point at 20 bars, so they rendered identically once the history was short.)
 */
const YEAR = 365 * DAY;
const WINDOW: Record<PeriodName, { ms: number; bars: number }> = {
  day: { ms: DAY, bars: 24 },
  week: { ms: 7 * DAY, bars: 7 },
  month: { ms: 30 * DAY, bars: 30 },
  year: { ms: YEAR, bars: 12 },
};

/**
 * Bucket the cumulative-earned timeline into per-interval earnings over the period's FIXED window (R8).
 * Bars show the DELTA between cumulative points (per-interval earnings), not the cumulative value.
 *
 * **Each delta is DISTRIBUTED proportionally across the bins its time interval overlaps**, not dumped in
 * the bin it starts in. Accrual is continuous, so an interval that spans three bins earned in all three;
 * proportional spreading renders sparse data (a handful of snapshots) as a smooth ramp instead of one
 * lonely spike, and makes each period's granularity visibly different. Real data, real window — periods
 * longer than the history simply show empty bins before the position existed, never invented growth.
 */
export function windowBars(chart: ChartPoint[], period: PeriodName, now: number): number[] {
  const { ms, bars } = WINDOW[period];
  const out = new Array<number>(bars).fill(0);
  if (chart.length < 2) return out;

  const start = now - ms; // fixed calendar window — each period is a distinct real span
  const binMs = ms / bars;

  // Baseline: cumulative earned at the window start (earnings before the series began are 0).
  let prev = 0;
  let prevTs = start;
  for (const p of chart) {
    if (p.ts <= start) {
      prev = p.earnedUsd;
      prevTs = p.ts;
    } else break;
  }

  for (const p of chart) {
    if (p.ts <= start) continue;
    const delta = Math.max(0, p.earnedUsd - prev);
    const iStart = Math.max(prevTs, start);
    const iEnd = Math.min(p.ts, now);
    const iSpan = iEnd - iStart;
    if (delta > 0 && iSpan > 0) {
      // Spread `delta` across the bins [iStart, iEnd] overlaps, proportional to the overlap.
      for (let b = 0; b < bars; b++) {
        const binStart = start + b * binMs;
        const overlap = Math.max(0, Math.min(iEnd, binStart + binMs) - Math.max(iStart, binStart));
        if (overlap > 0) out[b] = (out[b] ?? 0) + delta * (overlap / iSpan);
      }
    } else if (delta > 0) {
      // Zero-span interval (two points at the same ts): drop it in the bin it falls in.
      const bin = Math.min(bars - 1, Math.max(0, Math.floor(((iStart - start) / ms) * bars)));
      out[bin] = (out[bin] ?? 0) + delta;
    }
    prev = p.earnedUsd;
    prevTs = p.ts;
  }
  return out;
}

/**
 * The funded Earn screen's Growth card: chart + period control + per-month breakdown.
 *
 * **Zero-state (R10).** When nothing has been earned — the honest state of the live vault, whose
 * `share_price` is pinned to `SHARE_PRICE_SCALE` until mark-to-market NAV accrual ships (U5) — the card
 * says so in words instead of drawing a row of floor-height bars and a breakdown of nine `+$0.00` rows.
 * Bars at the 8px floor are not a chart of zero; they are a chart that looks broken. The deposit itself
 * is real and visible on Home's value chart, which steps on it.
 */
export function GrowthCard({
  chart,
  monthly,
  now,
}: {
  chart: ChartPoint[];
  monthly: MonthlyEarned[];
  now: number;
}) {
  const [period, setPeriod] = useState<PeriodName>("year");
  const hasEarnings = monthly.some((m) => m.earnedUsd > 0) || chart.some((p) => p.earnedUsd > 0);

  return (
    <Card className="p-5">
      <div className="mb-1 text-[15px] font-medium text-muted">Growth</div>
      {hasEarnings ? (
        <>
          <Bars values={windowBars(chart, period, now)} />
          <Segmented
            options={PERIODS}
            value={period}
            onChange={setPeriod}
            label="Period"
            variant="period"
            renderLabel={(p) => PERIOD_LABEL[p]}
          />
          <MonthlyBreakdown monthly={monthly} now={now} />
        </>
      ) : (
        <div data-testid="growth-zero" className="flex flex-col items-center gap-2 px-4 py-9 text-center">
          <span className="text-[15px] font-semibold">No earnings yet</span>
          <span className="max-w-[260px] text-[13.5px] leading-snug text-muted">
            Your deposits are allocated and safe. Yield shows up here as it accrues — nothing is hidden.
          </span>
        </div>
      )}
    </Card>
  );
}
