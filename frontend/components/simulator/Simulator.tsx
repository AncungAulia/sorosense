"use client";
import { useState } from "react";
import type { Currency } from "@sorosense/vault-client";
import { Card, Segmented } from "../ui";
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

/** `.hstep button` — the same dimensional treatment as `.icobtn`: white edge, card fill, soft shadow. */
const STEP_BUTTON =
  "grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full border border-white bg-card text-[17px] leading-none text-ink [box-shadow:0_1px_2px_rgba(17,19,22,.04),0_8px_18px_-10px_rgba(17,19,22,.18)]";

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
        {/* `.hstep`: two dimensional round buttons around the figure — no track behind them. */}
        <div className="flex shrink-0 items-center gap-[7px]" role="group" aria-label="Amount">
          <button onClick={() => step(-STEP)} aria-label="Decrease" className={STEP_BUTTON}>
            −
          </button>
          <span data-testid="amount" className="min-w-[52px] text-center text-[15px] font-semibold [font-variant-numeric:tabular-nums]">
            {SYMBOL[currency]}
            {amount.toLocaleString("en-US")}
          </span>
          <button onClick={() => step(STEP)} aria-label="Increase" className={STEP_BUTTON}>
            +
          </button>
        </div>
      </div>

      <Segmented
        options={CURRENCIES}
        value={currency}
        onChange={onCurrencyChange}
        label="Currency"
        variant="currency"
        className="mt-3"
      />

      <p className="mb-0.5 mt-4 text-[15px] font-medium text-muted">You would earn</p>
      <div data-testid="projection" className="text-[38px] font-semibold leading-none tracking-[-.02em] [font-variant-numeric:tabular-nums]">
        {money(projectedEarnings, currency)}
      </div>

      <Bars values={curve} />

      <Segmented
        options={PERIODS}
        value={period}
        onChange={setPeriod}
        label="Period"
        variant="period"
        renderLabel={(p) => PERIOD_LABEL[p]}
      />
    </Card>
  );
}
