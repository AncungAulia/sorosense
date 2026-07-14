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
 * `earnedUsd` is zero only while nothing has accrued — an unallocated bucket; once the bucket is in an
 * accruing `yield_pool` and `share_price` rises, `earnedUsd` rises with it, and `valueUsd` both steps on
 * each real deposit/withdrawal and curves up with accrual. Real money, real chart — never fabricated
 * upward on an unaccrued bucket, and never flattened back to zero once it has genuinely earned.
 */

import type { Address, Currency, VaultClient } from '@sorosense/vault-client';
import { SHARE_PRICE_SCALE } from '@sorosense/vault-client';

import { err, ok, type Result } from '../lib/result.js';
import { getCatalog } from '../tools/catalog.js';
import { makeReflectorReader, type ReflectorOptions } from '../tools/price.js';
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
  /** Cumulative earned (USD) at `ts`. Zero until the bucket's pool accrues, then rises with `share_price`. */
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
 * KTD3: a `ts` older than the first snapshot resolves to the base price. That is exact for a bucket that
 * had **no pool position** over that history (`share_price` *is* the scale then), which is the pre-boot
 * case this handles — it lets the value chart show a real step at a deposit that predates the server. Now
 * that mark-to-market NAV accrual has shipped (vault 1.3.0), an *allocated* bucket's pre-boot history is
 * no longer flat, so the snapshot series is load-bearing: sample often enough that the price curve is not
 * approximated by its base for a bucket that was already earning before boot.
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

  const values = new Map<Currency, bigint>();
  for (const c of currencies) values.set(c, await deps.vault.assetValueOf(user, c));

  // Resolve FX up front so a failure surfaces before we compute anything (R6: never a silent $0) — but
  // only for the buckets that can actually move a number. A bucket the user never touched (no value AND
  // no history) contributes `0 × rate = 0` to every figure in this view, exactly, at any rate; demanding
  // one would 503 the whole screen over an untouched bucket. That is not hypothetical: the Reflector feed
  // carries no MXN symbol at all, so its rate is permanently unavailable. Mirrors `getHoldings`, which
  // already resolves FX only for the buckets it actually displays.
  //
  // Fail-closed is preserved where it matters: a bucket holding value, or with any history in this view,
  // still REQUIRES a rate, and a failed read short-circuits the whole response.
  const inView = (e: VaultEvent): boolean => e.depositor === user && currencies.includes(e.currency);
  const rates = new Map<Currency, number>();
  for (const c of currencies) {
    const untouched =
      (values.get(c) ?? 0n) === 0n && !deps.events.some((e) => inView(e) && e.currency === c);
    if (untouched) continue; // no rate needed — every term this bucket contributes is exactly 0
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
    const nativeValue = values.get(c) ?? 0n;
    const rate = rates.get(c) ?? 0; // only ever 0 for an untouched bucket, whose terms are all 0 anyway
    const usdValue = toUsd(nativeValue, rate);
    const contributed = allBases.get(bucketKey(user, c))?.contributed ?? 0n;
    // Native yield only (value − contributions); FX is not part of earned (R7). Clamp at 0: mint floors
    // shares toward the vault (KTD10), so right after a deposit `value` can sit a sub-share below
    // `contributed` — a rounding dust, never a real loss. A deposit is never negative earnings.
    const bucketEarnedUsd = Math.max(0, toUsd(nativeValue - contributed, rate));

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
  // `ts` is not a sample either (it still replays into every state, as `ts ?? 0`). `inView` is the same
  // predicate the FX resolution above uses — a bucket with history is exactly a bucket that needs a rate.
  const eventTimes = deps.events.flatMap((e) => (inView(e) && e.ts !== undefined ? [e.ts] : []));
  const snapshotTimes = currencies.flatMap((c) => deps.snapshots.series(c).map((s) => s.ts));
  const times = [...new Set([...snapshotTimes, ...eventTimes])].sort((a, b) => a - b);

  // Yield only accumulates, so the earned line is monotonic non-decreasing: clamp each point to the
  // running max. A dip would only ever be mint-rounding/FX dust around a deposit (KTD10 rounds toward
  // the vault), and rendering it as a "you lost $0.01" wobble on the growth chart is a lie the running
  // max removes without inventing any growth (a real gain still rises exactly as computed). `valueUsd`
  // is left untouched — it legitimately steps up on a deposit and curves with accrual.
  let earnedFloor = 0;
  const chart: ChartPoint[] = times.map((t) => {
    const state = stateAt(user, t, deps.events, deps.snapshots, currencies, rates);
    earnedFloor = Math.max(earnedFloor, state.earnedUsd);
    return { ts: t, valueUsd: state.valueUsd, earnedUsd: earnedFloor };
  });

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
 * Default FX source backed by the real Reflector oracle (`tools/price.ts` — an on-chain SEP-40 read,
 * U1c). USD needs no read at all: the oracle's own base IS USD, so the numéraire's rate is exactly 1 by
 * definition. Every other bucket resolves to a feed symbol and is priced on-chain.
 *
 * A bucket with no symbol (the feed carries no MXN) fails closed with a typed error — NOT a rate of 1,
 * which would blend pesos to dollars one-for-one and invent money. Both `symbolOf` and the oracle
 * transport are injectable, so the offline suite passes a stub instead of reaching the network.
 */
export function makeReflectorFx(
  symbolOf: (currency: Currency) => string | null = defaultFxSymbol,
  options: ReflectorOptions = {},
): FxSource {
  // One reader for the process: it builds the RPC transport once and remembers the feed's scale, instead
  // of standing up a client per bucket per request.
  const readPrice = makeReflectorReader(options);

  return async (currency) => {
    if (currency === 'USD') return ok(1); // the oracle's base — the numéraire, no read
    const symbol = symbolOf(currency);
    if (symbol === null) {
      return err('unavailable', `no Reflector symbol configured for ${currency} (FX_SYMBOL_${currency})`);
    }
    const res = await readPrice(symbol);
    if (res.ok) return ok(res.value.price);
    // A symbol the feed does not carry is `not_found` at the tool boundary (precise, and what the
    // Sentinel wants), but as an FX RATE it is simply unavailable. Left as-is it would map to HTTP 404 —
    // which reads as "no such depositor" — so translate it to the 503 the read surfaces already mean.
    return res.code === 'not_found' ? err('unavailable', res.error) : res;
  };
}

/**
 * The Reflector symbol per currency — CONFIG, not code (KTD6). `FX_SYMBOL_EUR` / `FX_SYMBOL_MXN`
 * override the defaults, so a symbol that turns out wrong during a live smoke is a `.env` edit rather
 * than a patch release.
 *
 * The defaults are what the deployed oracle actually lists (verified live via `assets()`): the feed
 * quotes token symbols against a USD base, so EUR is priced as **`EURC`** (the euro stablecoin), not as
 * an `EURUSD` fiat pair — that pair does not exist on this oracle. MXN has NO symbol on the feed at all,
 * so it defaults to `null`.
 *
 * `null` means "no oracle symbol": for USD that is because it IS the base (rate 1, handled in
 * `makeReflectorFx`); for any other bucket it means the feed cannot price it, and the FX source fails
 * closed — a typed error → non-200 → "unavailable", never a silent $0 and never a fabricated 1:1 rate.
 */
export function fxSymbolFor(
  currency: Currency,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  switch (currency) {
    case 'USD':
      return null;
    case 'EUR':
      return env.FX_SYMBOL_EUR || 'EURC';
    case 'MXN':
      return env.FX_SYMBOL_MXN || null;
  }
}

/** The env-resolved symbol, read at call time so a late `.env` load still takes effect. */
function defaultFxSymbol(currency: Currency): string | null {
  return fxSymbolFor(currency);
}
