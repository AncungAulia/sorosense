/**
 * Earnings-history read surface (R1, R3-R7) — the deposited-state Earn screen. Read-only: it moves no
 * funds, calls no LLM, and exposes NO risk/label/score field (R14, safety is invisible).
 *
 * It composes four inputs into one blended-USD view:
 *  - the vault seam (`assetValueOf` for current bucket value),
 *  - cost-basis reconstructed from Deposit/Withdraw events (`cost-basis.ts`),
 *  - the share-price time series (`snapshotter.ts`) for the earned timeline + monthly breakdown,
 *  - an injected FX rate per currency (Reflector) for display-only USD conversion.
 *
 * Invariants: funds are never converted between buckets — the blended-USD figures are display only
 * (R3). "Earned" is native yield per bucket summed to USD; FX movement is never counted as earnings
 * (R6, R7), which falls out of `earned = value − contributions` where both are in native units. A
 * failed FX read surfaces as a typed `Result` error, never a silent $0.
 */

import type { Address, Currency, VaultClient } from '@sorosense/vault-client';
import { SHARE_PRICE_SCALE } from '@sorosense/vault-client';

import { err, ok, type Result } from '../lib/result.js';
import { getCatalog } from '../tools/catalog.js';
import { getReflectorPrice } from '../tools/price.js';
import { reconstructCostBasis, type VaultEvent } from '../earnings/cost-basis.js';
import type { SnapshotStore } from '../earnings/snapshotter.js';

/** The three currency buckets (never converted; blended only for display). */
export const ALL_CURRENCIES = ['USD', 'EUR', 'MXN'] as const;

/** Per-bucket drill-down under the blended headline. */
export interface BucketBreakdown {
  currency: Currency;
  /** Asset value in the bucket's own currency (from the vault seam). */
  nativeValue: bigint;
  /** Display-only USD conversion of `nativeValue`. */
  usdValue: number;
}

/** One point on the cumulative-earned timeline (USD), stamped with a snapshot timestamp. */
export interface ChartPoint {
  ts: number;
  earnedUsd: number;
}

/** Earned during one calendar month (UTC), in USD. `label` is `YYYY-MM`. */
export interface MonthlyEarned {
  label: string;
  earnedUsd: number;
}

/** The deposited-state Earn view. No risk/label/score field by design (R14). */
export interface EarningsView {
  /** Whether any bucket holds value — drives the 2-state Earn screen (R1, R2). */
  hasDeposit: boolean;
  /** Blended-USD "Earn balance" (R3). */
  balanceUsd: number;
  /** Blended APY, value-weighted across buckets (R5). */
  apy: number;
  /** Total earned to date, blended to USD (R6). */
  earnedUsd: number;
  /** Per-bucket drill-down; `usdValue` sums to `balanceUsd` (R4). */
  buckets: BucketBreakdown[];
  /** Cumulative earned over time; the frontend buckets it by Day/Week/Month/Year (R8). */
  chart: ChartPoint[];
  /** Per-month earned breakdown, oldest→newest; last entry is the current month (R9). */
  monthly: MonthlyEarned[];
}

/** USD rate per 1 unit of a currency. USD returns 1; others are looked up. Result — never throws. */
export type FxSource = (currency: Currency) => Promise<Result<number>>;

/** Dependencies injected so the surface is deterministic and testable. */
export interface EarningsDeps {
  /** Only the reads are needed — this surface never writes. */
  vault: Pick<VaultClient, 'assetValueOf'>;
  /** This user's Deposit/Withdraw events (each carrying `ts`); real reader deferred to integration. */
  events: readonly VaultEvent[];
  /** Share-price time series populated by the snapshotter. */
  snapshots: SnapshotStore;
  /** FX per currency (display-only). */
  fx: FxSource;
  currencies?: readonly Currency[];
}

/** Best (highest) Safe-pool APY for a currency, or 0 if none — mirrors `simulate`'s pool pick. */
function bestApy(currency: Currency): number {
  const safe = getCatalog(currency);
  return safe.reduce((max, v) => (v.apy > max ? v.apy : max), 0);
}

/** Latest snapshot price for a currency at or before `ts`; base price if none yet. */
function priceAt(snapshots: SnapshotStore, currency: Currency, ts: number): bigint {
  let price = SHARE_PRICE_SCALE;
  for (const s of snapshots.series(currency)) {
    if (s.ts <= ts) price = s.price;
    else break; // series is ascending by ts
  }
  return price;
}

const bucketKey = (user: Address, currency: Currency): string => `${user}:${currency}`;
const monthKey = (ts: number): string => {
  const d = new Date(ts);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

/**
 * Cumulative earned (USD) across all buckets at time `t`: replay events up to `t` for shares +
 * contributions, value them at the snapshot price at `t`, and convert with the current FX rates. Since
 * `earned = value − contributions` and a deposit raises both equally, deposits never inflate earned.
 */
function earnedCumulativeUsdAt(
  user: Address,
  t: number,
  events: readonly VaultEvent[],
  snapshots: SnapshotStore,
  currencies: readonly Currency[],
  rates: Map<Currency, number>,
): number {
  const basesAtT = reconstructCostBasis(events.filter((e) => (e.ts ?? 0) <= t));
  let total = 0;
  for (const c of currencies) {
    const basis = basesAtT.get(bucketKey(user, c)) ?? { shares: 0n, contributed: 0n };
    const valueNative = (basis.shares * priceAt(snapshots, c, t)) / SHARE_PRICE_SCALE;
    const earnedNative = valueNative - basis.contributed;
    total += Number(earnedNative) * (rates.get(c) ?? 0);
  }
  return total;
}

/**
 * Build the deposited-state Earn view for a user. Returns a typed `Result`: a failed FX read for any
 * bucket short-circuits to an error (the caller shows "unavailable", never $0).
 */
export async function getEarnings(user: Address, deps: EarningsDeps): Promise<Result<EarningsView>> {
  const currencies = deps.currencies ?? ALL_CURRENCIES;

  // Resolve FX up front so a failure surfaces before we compute anything (R6: never a silent $0).
  const rates = new Map<Currency, number>();
  for (const c of currencies) {
    const r = await deps.fx(c);
    if (!r.ok) return r;
    rates.set(c, r.value);
  }

  const allBases = reconstructCostBasis(deps.events);
  const buckets: BucketBreakdown[] = [];
  let balanceUsd = 0;
  let earnedUsd = 0;
  let apyWeighted = 0;

  for (const c of currencies) {
    const nativeValue = await deps.vault.assetValueOf(user, c);
    const rate = rates.get(c) ?? 0;
    const usdValue = Number(nativeValue) * rate;
    buckets.push({ currency: c, nativeValue, usdValue });
    balanceUsd += usdValue;

    const contributed = allBases.get(bucketKey(user, c))?.contributed ?? 0n;
    // Native yield only (value − contributions); FX is not part of earned (R7).
    earnedUsd += Number(nativeValue - contributed) * rate;
    apyWeighted += bestApy(c) * usdValue;
  }

  const apy = balanceUsd > 0 ? apyWeighted / balanceUsd : 0;
  const hasDeposit = buckets.some((b) => b.nativeValue > 0n);

  // Earned timeline sampled at every snapshot timestamp (union across buckets).
  const times = [
    ...new Set(currencies.flatMap((c) => deps.snapshots.series(c).map((s) => s.ts))),
  ].sort((a, b) => a - b);

  const chart: ChartPoint[] = times.map((t) => ({
    ts: t,
    earnedUsd: earnedCumulativeUsdAt(user, t, deps.events, deps.snapshots, currencies, rates),
  }));

  // Per-month deltas of the cumulative earned (last sample in each month wins).
  const cumByMonth = new Map<string, number>();
  for (const point of chart) cumByMonth.set(monthKey(point.ts), point.earnedUsd);
  let prevCum = 0;
  const monthly: MonthlyEarned[] = [...cumByMonth.entries()].map(([label, cum]) => {
    const earned = cum - prevCum;
    prevCum = cum;
    return { label, earnedUsd: earned };
  });

  return ok({ hasDeposit, balanceUsd, apy, earnedUsd, buckets, chart, monthly });
}

/**
 * Default FX source backed by Reflector (`price.ts`). USD is the numéraire (rate 1); other buckets
 * map to a Reflector symbol. Symbol format is a wiring detail (see the plan's Open Questions), so it
 * is injectable; tests pass a stub instead.
 */
export function makeReflectorFx(
  symbolOf: (currency: Currency) => string | null = defaultFxSymbol,
  baseUrl?: string,
): FxSource {
  return async (currency) => {
    const symbol = symbolOf(currency);
    if (symbol === null) return ok(1); // USD numéraire
    const res = await getReflectorPrice(symbol, baseUrl);
    if (!res.ok) return res;
    return ok(res.value.price);
  };
}

/** Provisional Reflector symbol per currency (USD = numéraire). Confirmed at wiring. */
function defaultFxSymbol(currency: Currency): string | null {
  switch (currency) {
    case 'USD':
      return null;
    case 'EUR':
      return 'EURUSD';
    case 'MXN':
      return 'MXNUSD';
  }
}
