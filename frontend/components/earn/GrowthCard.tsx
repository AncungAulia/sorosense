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

/** Window length and bar count per period. `year` spans whatever data exists. */
const WINDOW: Record<PeriodName, { ms: number | "all"; bars: number }> = {
  day: { ms: DAY, bars: 24 },
  week: { ms: 7 * DAY, bars: 7 },
  month: { ms: 30 * DAY, bars: 20 },
  year: { ms: "all", bars: 20 },
};

/**
 * Bucket the cumulative-earned timeline into per-interval earnings (R8). Bars show the DELTA between
 * cumulative points, not the cumulative value: over a short window a cumulative series is nearly flat
 * and every bar comes out the same height.
 *
 * The window is clamped to the data — we never invent points before the series begins.
 */
export function windowBars(chart: ChartPoint[], period: PeriodName, now: number): number[] {
  const { ms, bars } = WINDOW[period];
  const first = chart[0];
  if (!first || chart.length < 2) return new Array(bars).fill(0);

  const start = ms === "all" ? first.ts : Math.max(first.ts, now - ms);
  const span = now - start;
  const out = new Array<number>(bars).fill(0);
  if (span <= 0) return out;

  // Baseline: the last point at or before the window start. Its cumulative value is what the first
  // in-window delta is measured against, and its timestamp opens the first interval.
  let prev = first.earnedUsd;
  let prevTs = first.ts;
  for (const p of chart) {
    if (p.ts <= start) {
      prev = p.earnedUsd;
      prevTs = p.ts;
    } else break;
  }

  for (const p of chart) {
    if (p.ts <= start) continue;
    const delta = p.earnedUsd - prev;
    // An interval belongs to the bin it STARTS in, not the one it ends in. Binning by the end
    // timestamp leaves bin 0 permanently empty — the first interval ends inside bin 1 — and doubles
    // the last bin, because the point stamped exactly at `now` computes `bin === bars` and clamps
    // down onto an interval already there. With 24 hourly points across 24 bins, that is the whole
    // chart: a dot on the left and a spike on the right.
    const bin = Math.min(bars - 1, Math.max(0, Math.floor(((Math.max(prevTs, start) - start) / span) * bars)));
    out[bin] = (out[bin] ?? 0) + Math.max(0, delta);
    prev = p.earnedUsd;
    prevTs = p.ts;
  }
  return out;
}

/** The funded Earn screen's Growth card: chart + period control + per-month breakdown. */
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

  return (
    <Card className="p-5">
      <div className="mb-1 text-[15px] font-medium text-muted">Growth</div>
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
    </Card>
  );
}
