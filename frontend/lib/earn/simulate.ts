/**
 * Deterministic earnings simulator (R15) — mirrors `backend/src/api/simulate.ts`. The frontend cannot
 * call the backend (no HTTP API yet), so the math lives here too. It is math, not an LLM.
 *
 * No `poolId` is returned: the user picks a CURRENCY, the agent picks the pool. Nothing here carries
 * a risk label, tier, or score (R11).
 */
import type { Currency } from "@sorosense/vault-client";
import { getBucketMeta } from "../vault/data";

/** Named periods → days. Mirrors `PERIOD_DAYS` in the backend. */
export const PERIOD_DAYS = { day: 1, week: 7, month: 30, year: 365 } as const;
export type PeriodName = keyof typeof PERIOD_DAYS;

const DAYS_PER_YEAR = 365;

export interface SimulateInput {
  currency: Currency;
  /** Principal in the bucket's currency (major units) — never converted to USD. */
  amount: number;
  periodDays: number;
}

export interface SimulateResult {
  currency: Currency;
  amount: number;
  periodDays: number;
  apy: number;
  /** Projected auto-compounded earnings over the period, in the bucket's currency. */
  projectedEarnings: number;
}

/** Continuous compound growth over `days`, as a fraction of principal. */
export function growthFactor(apy: number, days: number): number {
  return (1 + apy / 100) ** (days / DAYS_PER_YEAR) - 1;
}

export function simulate(input: SimulateInput): SimulateResult {
  if (input.amount < 0 || input.periodDays < 0) {
    throw new Error("amount and periodDays must be non-negative");
  }
  const { apy } = getBucketMeta(input.currency);
  const projectedEarnings = Number((input.amount * growthFactor(apy, input.periodDays)).toFixed(2));
  return { currency: input.currency, amount: input.amount, periodDays: input.periodDays, apy, projectedEarnings };
}

/**
 * `n` samples of the same growth curve, for the simulator's bars. Sampling the projection itself
 * (rather than drawing an ornament) is what makes the period/currency/amount controls visibly move
 * the chart.
 */
export function simulateCurve(input: SimulateInput, n = 20): number[] {
  const { apy } = getBucketMeta(input.currency);
  return Array.from({ length: n }, (_, i) => input.amount * growthFactor(apy, (input.periodDays * (i + 1)) / n));
}
