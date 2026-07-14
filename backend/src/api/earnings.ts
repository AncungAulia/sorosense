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
 *
 * The timeline (`chart`) carries BOTH `valueUsd` and `earnedUsd` per point, from one replay (`stateAt`).
 * While the contract does not accrue yield, `earnedUsd` is honestly zero and `valueUsd` is a step
 * function that steps on each real deposit/withdrawal — a real chart of real money, flat by fact, never
 * fabricated upward.
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

/** Stablecoin base unit (7-dp stroops scale) — mirrors `holdings.ts`/`frontend/lib/vault/units.ts` UNIT. */
const UNIT = 10_000_000n;

/** Per-bucket drill-down under the blended headline. */
export interface BucketBreakdown {
  currency: Currency;
  /** Asset value in the bucket's own currency (from the vault seam). */
  nativeValue: bigint;
  /** Display-only USD conversion of `nativeValue`. */
  usdValue: number;
  /** Native yield of this bucket blended to USD (`nativeValue − contributed`); FX movement is never earnings (R7). */
  earnedUsd: number;
}

/**
 * One point on the value/earned timeline (USD). Sampled at the union of snapshot and event timestamps,
 * so a deposit is visible before the next snapshot tick (R8, R10).
 */
export interface ChartPoint {
  ts: number;
  /** Blended-USD asset value at `ts`. A step function: it steps on every deposit/withdrawal. */
  valueUsd: number;
  /** Cumulative earned (USD) at `ts`. Zero while the vault does not accrue — honestly flat, not fabricated. */
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
  /** Total earned to date, blended to USD (R6). Sums the buckets' `earnedUsd`. */
  earnedUsd: number;
  /** Per-bucket drill-down; `usdValue` sums to `balanceUsd`, `earnedUsd` to the headline `earnedUsd` (R4). */
  buckets: BucketBreakdown[];
  /** Value + cumulative earned over time; the frontend buckets it by Day/Week/Month/Year (R8, R10). */
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

/**
 * Latest snapshot price for a currency at or before `ts`; base price (`SHARE_PRICE_SCALE`) if none yet.
 *
 * KTD3: a `ts` older than the first snapshot resolving to the base price is not an approximation today —
 * the contract does not accrue (`total_assets` moves only on deposit/withdraw), so `share_price` *is* the
 * scale for the whole of that history. It is what lets the value chart show a real step at a deposit that
 * happened before the server booted. The day mark-to-market NAV accrual ships, this assumption expires
 * and the snapshot series becomes load-bearing for pre-boot history.
 */
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

/** Normalize the 7-dp base unit to whole currency units, then apply the display-only FX rate. */
const toUsd = (native: bigint, rate: number): number => (Number(native) / Number(UNIT)) * rate;

/** The blended-USD state of a user's buckets at one instant — both timeline fields, one replay. */
interface UsdStateAt {
  valueUsd: number;
  earnedUsd: number;
}

/**
 * Blended-USD value AND cumulative earned across all buckets at time `t`, from a single replay: events up
 * to `t` give shares + contributions, `priceAt(t)` values the shares, and the current FX rates convert for
 * display. Both timeline fields fall out of the same state — the chart never replays twice.
 *
 * Since `earned = value − contributions` and a deposit raises both equally, a deposit steps `valueUsd` but
 * leaves `earnedUsd` unmoved: a deposit is never profit.
 */
function stateAt(
  user: Address,
  t: number,
  events: readonly VaultEvent[],
  snapshots: SnapshotStore,
  currencies: readonly Currency[],
  rates: Map<Currency, number>,
): UsdStateAt {
  const basesAtT = reconstructCostBasis(events.filter((e) => (e.ts ?? 0) <= t));
  let valueUsd = 0;
  let earnedUsd = 0;
  for (const c of currencies) {
    const basis = basesAtT.get(bucketKey(user, c)) ?? { shares: 0n, contributed: 0n };
    const valueNative = (basis.shares * priceAt(snapshots, c, t)) / SHARE_PRICE_SCALE;
    const rate = rates.get(c) ?? 0;
    valueUsd += toUsd(valueNative, rate);
    earnedUsd += toUsd(valueNative - basis.contributed, rate);
  }
  return { valueUsd, earnedUsd };
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
    const usdValue = toUsd(nativeValue, rate);
    const contributed = allBases.get(bucketKey(user, c))?.contributed ?? 0n;
    // Native yield only (value − contributions); FX is not part of earned (R7).
    const bucketEarnedUsd = toUsd(nativeValue - contributed, rate);

    buckets.push({ currency: c, nativeValue, usdValue, earnedUsd: bucketEarnedUsd });
    balanceUsd += usdValue;
    earnedUsd += bucketEarnedUsd; // headline earned is the sum of the buckets', by construction
    apyWeighted += bestApy(c) * usdValue;
  }

  const apy = balanceUsd > 0 ? apyWeighted / balanceUsd : 0;
  const hasDeposit = buckets.some((b) => b.nativeValue > 0n);

  // Timeline sampled at the UNION of snapshot timestamps and this user's event timestamps: the event
  // times are what make a deposit step the value chart before the next snapshot tick (and what give a
  // freshly-booted server a non-empty chart at all — KTD3). Events outside the view (another depositor,
  // or a bucket the caller narrowed away) move no number here, so they add no sample; an event with no
  // `ts` is not a sample either (it still replays into every state, as `ts ?? 0`).
  const inView = (e: VaultEvent): boolean => e.depositor === user && currencies.includes(e.currency);
  const eventTimes = deps.events.flatMap((e) => (inView(e) && e.ts !== undefined ? [e.ts] : []));
  const snapshotTimes = currencies.flatMap((c) => deps.snapshots.series(c).map((s) => s.ts));
  const times = [...new Set([...snapshotTimes, ...eventTimes])].sort((a, b) => a - b);

  const chart: ChartPoint[] = times.map((t) => ({
    ts: t,
    ...stateAt(user, t, deps.events, deps.snapshots, currencies, rates),
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
