"use client";
import { useState } from "react";
import type { Currency } from "@sorosense/vault-client";
import type { MonthlyEarned } from "../../hooks/useEarnings";
import { PERIOD_DAYS, simulate, simulateCurve, type PeriodName } from "../../lib/earn/simulate";
import { CountUp, Segmented } from "../ui";

const SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const FULL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const CURRENCIES: readonly Currency[] = ["USD", "EUR"];
const PERIODS: readonly PeriodName[] = ["day", "week", "month", "year"];
const PERIOD_LABEL: Record<PeriodName, string> = { day: "Day", week: "Week", month: "Month", year: "Year" };
const SYMBOL: Record<Currency, string> = { USD: "$", EUR: "€", MXN: "MX$" };
const BAR_COUNT: Record<PeriodName, number> = { day: 4, week: 7, month: 10, year: 12 };
const STEP = 500;
const MIN = 500;
const MAX = 1_000_000;

/** "YYYY-MM" → 0-based month index (guarded to 0..11). */
function monthIdx(label: string): number {
  const mm = Number(label.slice(5, 7));
  return mm >= 1 && mm <= 12 ? mm - 1 : 0;
}
const money = (v: number) => `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const nativeMoney = (v: number, currency: Currency) =>
  `${SYMBOL[currency]}${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const nativeWhole = (v: number, currency: Currency) => `${SYMBOL[currency]}${Math.round(v).toLocaleString("en-US")}`;
const progressLabel = (period: PeriodName, index: number, count: number) => {
  if (period === "day") return `${Math.round(((index + 1) * 24) / count)}h`;
  if (period === "week") return `Day ${index + 1}`;
  if (period === "month") return `Day ${Math.round(((index + 1) * 30) / count)}`;
  return `Month ${index + 1}`;
};

const CHART_H = 132;
const SIM_CHART_H = 82;

export function useGrowthSimulation(apyOf: (currency: Currency) => number) {
  const [currency, setCurrency] = useState<Currency>("USD");
  const [amount, setAmount] = useState(1000);
  const [period, setPeriod] = useState<PeriodName>("year");
  const apy = apyOf(currency);
  const periodDays = PERIOD_DAYS[period];
  const { projectedEarnings } = simulate({ currency, amount, periodDays, apy });
  const curve = simulateCurve({ currency, amount, periodDays, apy }, BAR_COUNT[period]);
  const max = curve.reduce((m, v) => (v > m ? v : m), 0) || 1;
  const step = (delta: number) => setAmount((n) => Math.min(MAX, Math.max(MIN, n + delta)));

  return { currency, setCurrency, amount, period, setPeriod, projectedEarnings, curve, max, step };
}

export function SimulationAmountStepper({
  amount,
  currency,
  step,
}: {
  amount: number;
  currency: Currency;
  step: (delta: number) => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-2 rounded-full bg-pill px-1.5 py-1">
      <button
        type="button"
        onClick={() => step(-STEP)}
        aria-label="Decrease simulation amount"
        className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white text-[15px] font-semibold text-ink [box-shadow:inset_0_1px_0_rgba(255,255,255,.85),0_6px_14px_-10px_rgba(0,0,0,.18)]"
      >
        -
      </button>
      <CountUp value={amount} format={(n) => nativeWhole(n, currency)} className="min-w-[58px] text-center text-[12.5px] font-semibold [font-variant-numeric:tabular-nums]" />
      <button
        type="button"
        onClick={() => step(STEP)}
        aria-label="Increase simulation amount"
        className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white text-[15px] font-semibold text-ink [box-shadow:inset_0_1px_0_rgba(255,255,255,.85),0_6px_14px_-10px_rgba(0,0,0,.18)]"
      >
        +
      </button>
    </div>
  );
}

function CompactEarningsSimulator({
  currency,
  setCurrency,
  period,
  setPeriod,
  projectedEarnings,
  curve,
  max,
}: {
  currency: Currency;
  setCurrency: (currency: Currency) => void;
  period: PeriodName;
  setPeriod: (period: PeriodName) => void;
  projectedEarnings: number;
  curve: number[];
  max: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const hv = hover !== null ? curve[hover] : undefined;

  return (
    <div data-testid="growth-simulator" className="flex flex-1 flex-col">
      <Segmented
        options={CURRENCIES}
        value={currency}
        onChange={setCurrency}
        label="Simulation currency"
        variant="currency"
        renderLabel={(c) => (c === "USD" ? "USDC" : "EURC")}
        className="mt-3"
      />

      <div className="mt-3">
        <p className="text-[11.5px] font-semibold text-muted">You would earn</p>
        <CountUp
          value={projectedEarnings}
          format={(n) => nativeMoney(n, currency)}
          className="mt-1 block text-[26px] font-semibold leading-none tracking-[-.02em] text-ink [font-variant-numeric:tabular-nums]"
        />
      </div>

      <div className="relative mt-2">
        <div
          data-testid="simulator-bars"
          className="flex items-end gap-1"
          style={{ height: SIM_CHART_H }}
          onMouseLeave={() => setHover(null)}
        >
          {curve.map((v, i) => (
            <button
              key={i}
              type="button"
              aria-label={`${progressLabel(period, i, curve.length)} ${nativeMoney(v, currency)}`}
              onMouseEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              style={{ height: `${8 + (v / max) * (SIM_CHART_H - 8)}px` }}
              className="grow-bar min-h-[6px] flex-1 rounded-t-[5px] rounded-b-[2px] [background:linear-gradient(180deg,#22c55e,#16a34a)] transition-[height,opacity] duration-500 hover:opacity-[.82] focus:outline-none focus:ring-2 focus:ring-pos/25"
            />
          ))}
        </div>
        {hv !== undefined && (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-[125%] whitespace-nowrap rounded-[10px] border border-line bg-white px-2.5 py-1.5 text-[12.5px] font-semibold [box-shadow:0_1px_2px_rgba(17,19,22,.04),0_8px_18px_-10px_rgba(17,19,22,.18)]"
            style={{ left: `${((hover! + 0.5) / curve.length) * 100}%`, top: `${SIM_CHART_H * (1 - hv / max)}px` }}
          >
            {progressLabel(period, hover!, curve.length)} · <span className="text-pos">+{nativeMoney(hv, currency)}</span>
          </div>
        )}
      </div>

      <Segmented
        options={PERIODS}
        value={period}
        onChange={setPeriod}
        label="Simulation period"
        variant="period"
        renderLabel={(p) => PERIOD_LABEL[p]}
        className="mt-2"
      />
    </div>
  );
}

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
export function GrowthChart({
  monthly,
  hasDeposit = true,
  simulation,
}: {
  monthly: MonthlyEarned[];
  hasDeposit?: boolean;
  simulation?: ReturnType<typeof useGrowthSimulation>;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const n = monthly.length;
  const maxEarned = monthly.reduce((m, x) => (x.earnedUsd > m ? x.earnedUsd : m), 0);
  const max = maxEarned || 1;
  const hv = hover !== null ? monthly[hover] : undefined;

  if (!hasDeposit && simulation) {
    return (
      <CompactEarningsSimulator
        currency={simulation.currency}
        setCurrency={simulation.setCurrency}
        period={simulation.period}
        setPeriod={simulation.setPeriod}
        projectedEarnings={simulation.projectedEarnings}
        curve={simulation.curve}
        max={simulation.max}
      />
    );
  }

  if (!monthly.some((m) => m.earnedUsd > 0)) {
    return (
      <div
        data-testid="growth-zero"
        className="flex flex-1 flex-col items-center justify-center py-6 text-center"
      >
        <div className="grid h-12 w-12 place-items-center rounded-full border border-line bg-white [box-shadow:0_1px_2px_rgba(17,19,22,.04),0_10px_22px_-16px_rgba(17,19,22,.2)]">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="text-ink-2" aria-hidden="true">
            <path d="M3 17l6-6 4 4 7-7" />
            <path d="M14 8h6v6" />
          </svg>
        </div>
        <span className="mt-3 text-[13.5px] font-semibold">No earnings yet</span>
        <span className="mt-1 max-w-[210px] text-[12.5px] leading-snug text-muted">
          Your chart starts moving as yield accrues.
        </span>
      </div>
    );
  }

  return (
    <div className="relative mt-2">
      <div data-testid="bars" className="flex items-end justify-start gap-[5px]" style={{ height: CHART_H }} onMouseLeave={() => setHover(null)}>
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
      <div className="mt-2 flex justify-start gap-[5px]">
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
