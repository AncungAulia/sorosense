/**
 * Per-bucket holdings read surface (R1, R6) — a drop-in for the frontend `BucketView`
 * (`frontend/hooks/useBuckets.ts`). Read-only: it moves no funds, calls no LLM, and exposes NO
 * risk/label/score field (R14, safety is invisible).
 *
 * It composes three inputs into one per-bucket view:
 *  - the vault seam (`balanceOf`/`assetValueOf`/`activePool`/`poolStatus`),
 *  - the shared venue-metadata module (`venue-meta.ts`, catalog-derived — DRY with funding),
 *  - an injected FX rate per currency (Reflector) for display-only USD conversion.
 *
 * `Holding` is a superset of the frontend `BucketView`, adding `kind`. As in `getEarnings`, a failed
 * FX read surfaces as a typed `Result` error, never a silent $0.
 */

import type { Address, Currency, VaultClient } from '@sorosense/vault-client';

import { ok, type Result } from '../lib/result.js';
import { netApy as toNetApy, performanceFeeBps } from '../tools/fee.js';
import { ALL_CURRENCIES, makeReflectorFx, type FxSource } from './earnings.js';
import { bestSafeVenue, catalogApy, kindLabel, resolveVenue, type ApySource } from './venue-meta.js';

export { makeReflectorFx, type FxSource };

/** Stablecoin base unit (7-dp stroops scale) — mirrors `frontend/lib/vault/units.ts` UNIT. */
const UNIT = 10_000_000n;

/** One funded currency bucket. Superset of the frontend `BucketView` (adds `kind`); no risk field. */
export interface Holding {
  currency: Currency;
  /** Venue full name, e.g. "DeFindex USDC vault". */
  name: string;
  /** Provider, e.g. "DeFindex". */
  venue: string;
  kind: 'lending' | 'vault' | 'rwa';
  /** `[venue, kindLabel(kind, name)]` — matches the frontend's bucket tags. */
  tags: string[];
  /** Gross APY the venue pays (the pool's on-chain rate). */
  apy: number;
  /** APY the depositor keeps after the {@link feeBps} performance fee. */
  netApy: number;
  /** Performance fee in basis points (a share of yield, not principal). */
  feeBps: number;
  shares: bigint;
  /** Native base-unit value of the bucket (from `assetValueOf`). */
  value: bigint;
  /** Display-only USD conversion of `value`. */
  valueUsd: number;
  /** Whether the active pool is paused (Sentinel freeze). */
  frozen: boolean;
}

/** Dependencies injected so the surface is deterministic and testable. */
export interface HoldingsDeps {
  /** Only the reads are needed — this surface never writes. */
  vault: Pick<VaultClient, 'balanceOf' | 'assetValueOf' | 'activePool' | 'poolStatus'>;
  /** FX per currency (display-only). */
  fx: FxSource;
  /** APY per pool — live on-chain `rate_bps()` in production, catalog figure offline. Default: catalog. */
  apy?: ApySource;
  currencies?: readonly Currency[];
}

/**
 * Build the per-bucket holdings for a depositor. Buckets with no shares are skipped. Returns a typed
 * `Result`: a failed FX read for any held currency short-circuits to an error (the caller shows
 * "unavailable", never $0).
 */
export async function getHoldings(depositor: Address, deps: HoldingsDeps): Promise<Result<Holding[]>> {
  const currencies = deps.currencies ?? ALL_CURRENCIES;
  const apySource = deps.apy ?? catalogApy;
  const feeBps = performanceFeeBps();

  // Each currency is an independent read pipeline; run them all concurrently, and within one currency
  // fire the mutually-independent reads together. Against a live RPC these calls are ~0.5-1s each, so a
  // sequential version (one after another across USD/EUR/MXN) blew past the frontend's request timeout
  // and the row silently fell back to the fixture venue — the "SoroSense pool shows as DeFindex" bug.
  // Order is preserved (Promise.all keeps input order); a `null` marks a skipped/empty bucket.
  const results = await Promise.all(
    currencies.map(async (currency): Promise<Result<Holding | null>> => {
      const shares = await deps.vault.balanceOf(depositor, currency);
      if (shares <= 0n) return ok(null); // empty bucket — not a holding

      const [value, pool, rate] = await Promise.all([
        deps.vault.assetValueOf(depositor, currency),
        deps.vault.activePool(currency),
        deps.fx(currency), // display FX; a failure surfaces as an error (never a silent $0)
      ]);
      if (!rate.ok) return rate;

      // Allocated → the pool's venue; unallocated → the currency's best-safe target (the agent's default).
      const meta = pool ? resolveVenue(pool) : bestSafeVenue(currency);
      if (!meta) return ok(null); // no vetted venue for this currency — omit rather than emit a partial

      const [frozen, apy] = await Promise.all([
        pool ? deps.vault.poolStatus(pool).then((s) => s === 'frozen') : Promise.resolve(false),
        // The venue's APY: the live on-chain rate for a deployed pool, the catalog figure otherwise.
        apySource(meta.id),
      ]);
      if (!apy.ok) return apy;

      const valueUsd = (Number(value) / Number(UNIT)) * rate.value;
      return ok({
        currency,
        name: meta.name,
        venue: meta.venue,
        kind: meta.kind,
        tags: [meta.venue, kindLabel(meta.kind, meta.name)],
        apy: apy.value,
        netApy: toNetApy(apy.value, feeBps),
        feeBps,
        shares,
        value,
        valueUsd,
        frozen,
      });
    }),
  );

  // Fail-closed: any currency's failed FX/APY read fails the whole view (same posture as the loop).
  for (const r of results) {
    if (!r.ok) return r;
  }
  const holdings = results
    .map((r) => (r.ok ? r.value : null))
    .filter((h): h is Holding => h !== null);
  return ok(holdings);
}
