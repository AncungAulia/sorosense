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
  apy: number;
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
  const holdings: Holding[] = [];

  for (const currency of currencies) {
    const shares = await deps.vault.balanceOf(depositor, currency);
    if (shares <= 0n) continue; // empty bucket — not a holding

    const value = await deps.vault.assetValueOf(depositor, currency);
    const pool = await deps.vault.activePool(currency);
    const frozen = pool ? (await deps.vault.poolStatus(pool)) === 'frozen' : false;

    // Allocated → the pool's venue; unallocated → the currency's best-safe target (the agent's default).
    const meta = pool ? resolveVenue(pool) : bestSafeVenue(currency);
    if (!meta) continue; // no vetted venue for this currency — omit rather than emit a partial bucket

    // The venue's APY: the live on-chain rate for a deployed pool, the catalog figure otherwise. A
    // failed read surfaces as an error (like FX) rather than a stale headline (R2, KTD7).
    const apy = await apySource(meta.id);
    if (!apy.ok) return apy;

    // Resolve FX before display; a failure surfaces as an error (never a silent $0).
    const rate = await deps.fx(currency);
    if (!rate.ok) return rate;
    const valueUsd = (Number(value) / Number(UNIT)) * rate.value;

    holdings.push({
      currency,
      name: meta.name,
      venue: meta.venue,
      kind: meta.kind,
      tags: [meta.venue, kindLabel(meta.kind, meta.name)],
      apy: apy.value,
      shares,
      value,
      valueUsd,
      frozen,
    });
  }

  return ok(holdings);
}
