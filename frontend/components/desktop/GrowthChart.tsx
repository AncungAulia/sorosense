"use client";
import { useState } from "react";
import type { MonthlyEarned } from "../../hooks/useEarnings";

const SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const FULL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "YYYY-MM" → 0-based month index (guarded to 0..11). */
function monthIdx(label: string): number {
  const mm = Number(label.slice(5, 7));
  return mm >= 1 && mm <= 12 ? mm - 1 : 0;
}
const money = (v: number) => `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const CHART_H = 132;

/**
 * Desktop Growth = the monthly-earnings bar chart (mockup `.gbars`). Alternating light/dark green
 * bars, the last bar (this month, in progress) is the bright accent, sparse axis labels, and a hover
 * tooltip "{month} · +${earned}". Each bar is a focusable button whose aria-label carries the value —
 * the bars themselves are decorative. Replaces the mobile `Bars` reuse on desktop.
 *
 * **Zero-state (R10).** With no earnings — the honest state of the live vault, whose `share_price` is
 * pinned to the scale until NAV accrual ships — this renders an explicit "no earnings yet" panel. It
 * must not render nine minimum-height bars: a row of stubs reads as a chart that is broken or still
 * loading, when in fact it is a correct picture of zero. Deposits are safe and earning; the yield has
 * simply not accrued on-chain yet.
 */
export function GrowthChart({ monthly }: { monthly: MonthlyEarned[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const n = monthly.length;
  const max = monthly.reduce((m, x) => (x.earnedUsd > m ? x.earnedUsd : m), 0) || 1;
  const hv = hover !== null ? monthly[hover] : undefined;

  if (!monthly.some((m) => m.earnedUsd > 0)) {
    return (
      <div
        data-testid="growth-zero"
        className="flex flex-1 flex-col items-center justify-center gap-1.5 py-6 text-center"
      >
        <span className="text-[13.5px] font-semibold">No earnings yet</span>
        <span className="max-w-[190px] text-[12.5px] leading-snug text-muted">
          Your buckets are allocated and safe. Yield shows up here as it accrues.
        </span>
      </div>
    );
  }

  return (
    <div className="relative mt-2">
      <div data-testid="bars" className="flex items-end justify-center gap-[5px]" style={{ height: CHART_H }} onMouseLeave={() => setHover(null)}>
        {monthly.map((m, i) => {
          const isLast = i === n - 1;
          const grad = isLast
            ? "[background:linear-gradient(180deg,#22c55e,#16a34a)]"
            : i % 2
              ? "[background:linear-gradient(180deg,#1f9f4d,#127636)]"
              : "[background:linear-gradient(180deg,#93e6b1,#63cf8c)]";
          return (
            <button
              key={m.label}
              type="button"
              aria-label={`${FULL[monthIdx(m.label)] ?? ""} ${money(m.earnedUsd)}`}
              onMouseEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              style={{ height: `${Math.max(6, (m.earnedUsd / max) * CHART_H)}px`, animationDelay: `${i * 40}ms` }}
              className={`grow-bar min-h-[6px] w-full max-w-[52px] flex-1 rounded-t-[4px] rounded-b-[2px] transition-opacity hover:opacity-[.82] ${grad}`}
            />
          );
        })}
      </div>
      <div className="mt-2 flex justify-center gap-[5px]">
        {monthly.map((m, i) => (
          <span key={m.label} className="w-full max-w-[52px] flex-1 text-center text-[10px] font-medium text-faint">
            {i % 3 === 0 || i === n - 1 ? (SHORT[monthIdx(m.label)] ?? "") : ""}
          </span>
        ))}
      </div>
      {hv && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-[125%] whitespace-nowrap rounded-[10px] border border-line bg-white px-2.5 py-1.5 text-[12.5px] font-semibold [box-shadow:0_1px_2px_rgba(17,19,22,.04),0_8px_18px_-10px_rgba(17,19,22,.18)]"
          style={{ left: `${((hover! + 0.5) / n) * 100}%`, top: `${CHART_H * (1 - hv.earnedUsd / max)}px` }}
        >
          {hover === n - 1 ? "This month" : (FULL[monthIdx(hv.label)] ?? "")} · <span className="text-pos">+{money(hv.earnedUsd)}</span>
        </div>
      )}
    </div>
  );
}
