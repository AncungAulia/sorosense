"use client";
import { useState } from "react";
import type { MonthlyEarned } from "../../hooks/useEarnings";

const PAGE = 3;
/** Explicit names: `toLocaleString` depends on the runtime's ICU data, which varies across CI images. */
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

/**
 * `YYYY-MM` → a human label, relative to `now`. The year is kept for older years so two Novembers are
 * never ambiguous.
 */
export function formatMonthLabel(label: string, now: number): string {
  const [yearStr = "", monthStr = ""] = label.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr) - 1;
  const d = new Date(now);
  if (year === d.getUTCFullYear() && month === d.getUTCMonth()) return "This month";
  const name = MONTH_NAMES[month] ?? label;
  return year === d.getUTCFullYear() ? name : `${name} ${year}`;
}

const usd = (n: number) => `$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Per-month earned, newest first. The backend sends `monthly` oldest→newest.
 *
 * `earnedUsd` is rendered sign-aware: `+` green for a gain, `−` red for a loss, and a **neutral, unsigned
 * grey** for exactly zero — a green "+$0.00" claims a gain that did not happen, which is the whole class
 * of lie this unit removes (R10). An all-zero month list is the live vault's honest state today; the
 * caller (`GrowthCard`) replaces the whole card with a zero-state before it gets here, and a month list
 * with nothing in it renders nothing rather than an empty rule.
 */
export function MonthlyBreakdown({ monthly, now }: { monthly: MonthlyEarned[]; now: number }) {
  const [shown, setShown] = useState(PAGE);
  const rows = [...monthly].reverse();
  const visible = rows.slice(0, shown);

  if (rows.length === 0) return null;

  return (
    <div className="mt-4">
      {visible.map((m) => (
        <div
          key={m.label}
          data-testid="month-row"
          className="flex items-center justify-between border-t border-line py-[13px] font-semibold"
        >
          <span>{formatMonthLabel(m.label, now)}</span>
          <span
            className={`[font-variant-numeric:tabular-nums] ${
              m.earnedUsd < 0 ? "text-neg" : m.earnedUsd > 0 ? "text-pos" : "text-muted"
            }`}
          >
            {m.earnedUsd < 0 ? "−" : m.earnedUsd > 0 ? "+" : ""}
            {usd(m.earnedUsd)}
          </span>
        </div>
      ))}
      {shown < rows.length && (
        <button
          onClick={() => setShown((n) => Math.min(n + PAGE, rows.length))}
          className="flex w-full items-center justify-center gap-[3px] border-t border-line pb-[3px] pt-[13px] text-[13.5px] font-medium text-muted"
        >
          Load more
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      )}
    </div>
  );
}
