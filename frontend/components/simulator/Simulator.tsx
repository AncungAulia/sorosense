"use client";
import { useState } from "react";
import type { Currency } from "@sorosense/vault-client";
import { Card, CountUp, Segmented } from "../ui";
import { PERIOD_DAYS, simulate, simulateCurve, type PeriodName } from "../../lib/earn/simulate";

/** The picker offers USD and EUR only (R3) — MXN has no user-facing control on any surface. */
const CURRENCIES: readonly Currency[] = ["USD", "EUR"];
const PERIODS: readonly PeriodName[] = ["day", "week", "month", "year"];
/**
 * Labels are capitalized in the DOM, not with a `capitalize` class: CSS text-transform does not
 * change a button's accessible name, so `getByRole("button", { name: "Month" })` would never match.
 */
const PERIOD_LABEL: Record<PeriodName, string> = { day: "Day", week: "Week", month: "Month", year: "Year" };
/**
 * MXN keeps its entry even though the picker no longer offers it: the map is `Record<Currency, string>`
 * and `Currency` still carries MXN, so dropping the key is a type error, not a cleanup. It also
 * disambiguates MXN from USD, which `lib/vault/units.ts` renders as the same "$".
 */
const SYMBOL: Record<Currency, string> = { USD: "$", EUR: "€", MXN: "MX$" };

const STEP = 500;
const MIN = 500;
const MAX = 1_000_000;

/**
 * How many bars each horizon draws. The chart gets denser as the horizon grows, because a longer
 * horizon has more to say: a single day of compounding is very nearly a straight line, and slicing
 * it twenty ways only manufactures detail that isn't there. Each count is a natural division —
 * six-hour blocks, one bar per day, ~2.5-day blocks, and mock-2's twenty for the year.
 */
const BAR_COUNT: Record<PeriodName, number> = { day: 4, week: 7, month: 12, year: 20 };
const CHART_H = 118;

/** `.hstep button` — the same dimensional treatment as `.icobtn`: white edge, card fill, soft shadow. */
const STEP_BUTTON =
  "grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full border border-white bg-card text-[17px] leading-none text-ink [box-shadow:0_1px_2px_rgba(17,19,22,.04),0_8px_18px_-10px_rgba(17,19,22,.18)]";

const money = (n: number, currency: Currency) =>
  `${SYMBOL[currency]}${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const progressLabel = (period: PeriodName, index: number, count: number) => {
  if (period === "day") return `${Math.round(((index + 1) * 24) / count)}h`;
  if (period === "week") return `Day ${index + 1}`;
  if (period === "month") return `Day ${Math.round(((index + 1) * 30) / count)}`;
  return `Month ${index + 1}`;
};

/**
 * The deterministic earnings simulator (R15). The user picks a CURRENCY — never a pool, never a risk
 * tier. `currency` is controlled by the Earn page because the empty-state hero shows the same APY, and
 * `apy` is resolved there through `useApy` (R5): the math module takes the rate, it never looks it up.
 */
export function Simulator({
  currency,
  apy,
  onCurrencyChange,
}: {
  currency: Currency;
  apy: number;
  onCurrencyChange: (c: Currency) => void;
}) {
  const [amount, setAmount] = useState(1000);
  const [period, setPeriod] = useState<PeriodName>("year");
  const [hover, setHover] = useState<number | null>(null);

  const periodDays = PERIOD_DAYS[period];
  const { projectedEarnings } = simulate({ currency, amount, periodDays, apy });
  // Samples of the projection's own growth curve, one per bar. <Bars> normalizes against the series
  // maximum, but the curve is not self-similar under time rescaling — a one-year horizon is visibly
  // convex where a one-day horizon is near-linear — so the bars redraw, not just re-count.
  const curve = simulateCurve({ currency, amount, periodDays, apy }, BAR_COUNT[period]);
  const max = curve.reduce((m, v) => (v > m ? v : m), 0) || 1;
  const hv = hover !== null ? curve[hover] : undefined;
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
      <CountUp
        value={projectedEarnings}
        format={(n) => money(n, currency)}
        className="block text-[38px] font-semibold leading-none tracking-[-.02em] [font-variant-numeric:tabular-nums]"
      />
      <span data-testid="projection" className="sr-only">{money(projectedEarnings, currency)}</span>

      <div className="relative my-3.5">
        <div
          data-testid="bars"
          aria-hidden="true"
          className="flex items-end gap-1"
          style={{ height: CHART_H }}
          onMouseLeave={() => setHover(null)}
        >
          {curve.map((v, i) => (
            <div
              key={i}
              data-testid="bar"
              onMouseEnter={() => setHover(i)}
              style={{ height: `${8 + (v / max) * (CHART_H - 8)}px`, animationDelay: `${i * 26}ms` }}
              className="grow-bar min-h-[6px] flex-1 rounded-t-[5px] rounded-b-[2px] [background:linear-gradient(180deg,#22c55e,var(--color-pos))] transition-[height,opacity] duration-500 hover:opacity-[.82]"
            />
          ))}
        </div>
        {hv !== undefined && (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-[125%] whitespace-nowrap rounded-[10px] border border-line bg-white px-2.5 py-1.5 text-[12.5px] font-semibold [box-shadow:0_1px_2px_rgba(17,19,22,.04),0_8px_18px_-10px_rgba(17,19,22,.18)]"
            style={{ left: `${((hover! + 0.5) / curve.length) * 100}%`, top: `${CHART_H * (1 - hv / max)}px` }}
          >
            {progressLabel(period, hover!, curve.length)} · <span className="text-pos">+{money(hv, currency)}</span>
          </div>
        )}
      </div>

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
