"use client";
import { useState } from "react";
import type { Currency } from "@sorosense/vault-client";
import { Card } from "../ui";
import { Bars } from "../earn/Bars";
import { PERIOD_DAYS, simulate, simulateCurve, type PeriodName } from "../../lib/earn/simulate";

const CURRENCIES: readonly Currency[] = ["USD", "EUR", "MXN"];
const PERIODS: readonly PeriodName[] = ["day", "week", "month", "year"];
/**
 * Labels are capitalized in the DOM, not with a `capitalize` class: CSS text-transform does not
 * change a button's accessible name, so `getByRole("button", { name: "Month" })` would never match.
 */
const PERIOD_LABEL: Record<PeriodName, string> = { day: "Day", week: "Week", month: "Month", year: "Year" };
/** Simulator symbols disambiguate MXN from USD; `lib/vault/units.ts` renders both as "$". */
const SYMBOL: Record<Currency, string> = { USD: "$", EUR: "€", MXN: "MX$" };

const STEP = 500;
const MIN = 500;
const MAX = 1_000_000;

const money = (n: number, currency: Currency) =>
  `${SYMBOL[currency]}${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * The deterministic earnings simulator (R15). The user picks a CURRENCY — never a pool, never a risk
 * tier. `currency` is controlled by the Earn page because the empty-state hero shows the same APY.
 */
export function Simulator({
  currency,
  onCurrencyChange,
}: {
  currency: Currency;
  onCurrencyChange: (c: Currency) => void;
}) {
  const [amount, setAmount] = useState(1000);
  const [period, setPeriod] = useState<PeriodName>("year");

  const periodDays = PERIOD_DAYS[period];
  const { projectedEarnings } = simulate({ currency, amount, periodDays });
  // 20 samples of the projection's own growth curve. <Bars> normalizes against the series maximum,
  // but the curve is not self-similar under time rescaling — a one-year horizon is visibly convex
  // where a one-day horizon is near-linear — so the bars really do redraw when the period changes.
  const curve = simulateCurve({ currency, amount, periodDays });
  const step = (delta: number) => setAmount((a) => Math.min(MAX, Math.max(MIN, a + delta)));

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <div className="whitespace-nowrap text-[15px] font-semibold">Simulate earnings</div>
        <div className="flex h-9 items-center gap-1 rounded-full bg-black/[.04] px-1" role="group" aria-label="Amount">
          <button onClick={() => step(-STEP)} aria-label="Decrease" className="h-7 w-7 rounded-full text-lg leading-none">
            −
          </button>
          <span data-testid="amount" className="min-w-[76px] text-center text-sm font-semibold [font-variant-numeric:tabular-nums]">
            {SYMBOL[currency]}
            {amount.toLocaleString("en-US")}
          </span>
          <button onClick={() => step(STEP)} aria-label="Increase" className="h-7 w-7 rounded-full text-lg leading-none">
            +
          </button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-1 rounded-full bg-black/[.04] p-1" role="group" aria-label="Currency">
        {CURRENCIES.map((c) => (
          <button
            key={c}
            onClick={() => onCurrencyChange(c)}
            aria-pressed={c === currency}
            className={`h-9 rounded-full text-sm font-semibold ${c === currency ? "bg-white text-ink [box-shadow:0_1px_2px_rgba(17,19,22,.08)]" : "text-muted"}`}
          >
            {c}
          </button>
        ))}
      </div>

      <p className="mb-0.5 mt-4 text-[15px] font-medium text-muted">You would earn</p>
      <div data-testid="projection" className="text-[38px] font-semibold leading-none tracking-[-.02em] [font-variant-numeric:tabular-nums]">
        {money(projectedEarnings, currency)}
      </div>

      <Bars values={curve} />

      <div className="mt-3 grid grid-cols-4 gap-1 rounded-full bg-black/[.04] p-1" role="group" aria-label="Period">
        {PERIODS.map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            aria-pressed={p === period}
            className={`h-9 rounded-full text-sm font-semibold ${p === period ? "bg-white text-ink [box-shadow:0_1px_2px_rgba(17,19,22,.08)]" : "text-muted"}`}
          >
            {PERIOD_LABEL[p]}
          </button>
        ))}
      </div>
    </Card>
  );
}
