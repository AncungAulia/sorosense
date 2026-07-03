/**
 * Deterministic earnings simulator (R15) — the only user-facing AI-adjacent surface, and it uses
 * math, not an LLM. Given a currency, amount, and period, it projects auto-compounded earnings for
 * the current best Safe pool in that currency. The result carries NO risk label (R11): safety is
 * invisible. This module performs no state-changing calls.
 */

import type { Currency } from '@sorosense/vault-client';
import { getCatalog } from '../tools/catalog.js';

export interface SimulateInput {
  currency: Currency;
  /** Principal in the bucket's currency (major units). */
  amount: number;
  /** Projection horizon in days. */
  periodDays: number;
}

export interface SimulateResult {
  currency: Currency;
  amount: number;
  periodDays: number;
  /** APY of the best Safe pool used for the projection. No risk label is exposed. */
  apy: number;
  /** Opaque pool id used (for wiring/debug), not a user risk signal. */
  poolId: string;
  /** Projected auto-compounded earnings over the period, in the bucket's currency. */
  projectedEarnings: number;
}

const DAYS_PER_YEAR = 365;

/** The best Safe pool for a currency by APY (Sentinel-vetted set). Deterministic. */
function bestSafePool(currency: Currency): { poolId: string; apy: number } | null {
  const safe = getCatalog(currency);
  if (safe.length === 0) return null;
  return safe.reduce((best, v) => (v.apy > best.apy ? { poolId: v.id, apy: v.apy } : best), {
    poolId: safe[0]!.id,
    apy: safe[0]!.apy,
  });
}

/**
 * Project earnings deterministically (no LLM). Auto-compounding is modeled as continuous compound
 * growth: earnings = amount * ((1 + apy/100)^(days/365) - 1). Throws only on invalid input; makes
 * no network or on-chain call.
 */
export function simulate(input: SimulateInput): SimulateResult {
  if (input.amount < 0 || input.periodDays < 0) {
    throw new Error('amount and periodDays must be non-negative');
  }
  const pool = bestSafePool(input.currency);
  if (!pool) {
    return {
      currency: input.currency,
      amount: input.amount,
      periodDays: input.periodDays,
      apy: 0,
      poolId: '',
      projectedEarnings: 0,
    };
  }
  const growth = (1 + pool.apy / 100) ** (input.periodDays / DAYS_PER_YEAR) - 1;
  const projectedEarnings = Number((input.amount * growth).toFixed(2));
  return {
    currency: input.currency,
    amount: input.amount,
    periodDays: input.periodDays,
    apy: pool.apy,
    poolId: pool.poolId,
    projectedEarnings,
  };
}

/** Convenience: named periods → days. */
export const PERIOD_DAYS = { day: 1, week: 7, month: 30, year: 365 } as const;
export type PeriodName = keyof typeof PERIOD_DAYS;
