"use client";
import { useCallback } from "react";
import type { Currency } from "@sorosense/vault-client";
import type { Holding } from "../lib/api/types";
import { getBucketMeta } from "../lib/vault/data";
import { useHoldings } from "./useHoldings";

/**
 * The **one** APY accessor for every user surface (R5, KTD3).
 *
 * Two honest sources, one seam:
 *  - a **funded** bucket takes its rate from the backend's `GET /holdings` row (catalog-derived there,
 *    so it is the truth the keeper allocates against);
 *  - an **unfunded** bucket — the Earn empty-state hero, the simulator — has no `/holdings` row
 *    (`getHoldings` skips zero-share buckets, correctly) and no backend rate route exists yet, so it
 *    falls back to `BUCKET_META`. Same when the API is off entirely, or the read failed.
 *
 * Every call site (`useBuckets`, the Earn hero, the per-bucket views, the simulator) goes through here,
 * so the day a backend rate route lands this is a one-file change, not a re-hunt through three surfaces.
 */

/** Pure resolution: the backend row's rate, else the documented fixture fallback. Never `NaN`. */
export function apyFrom(holdings: Holding[] | null, currency: Currency): number {
  const row = holdings?.find((h) => h.currency === currency);
  // A row whose `apy` is not a finite number is a broken read, not a rate — fall back rather than
  // render "NaN% APY".
  return row && Number.isFinite(row.apy) ? row.apy : getBucketMeta(currency).apy;
}

/**
 * A stable `(currency) => apy` resolver, for surfaces that need more than one bucket's rate
 * (`useBuckets`, the Earn page's bucket toggle). Stable across renders for a given `holdings`, so it
 * is safe in a dependency array.
 */
export function useApyResolver(): (currency: Currency) => number {
  const { holdings } = useHoldings();
  return useCallback((currency: Currency) => apyFrom(holdings, currency), [holdings]);
}

/** One bucket's APY. */
export function useApy(currency: Currency): number {
  return useApyResolver()(currency);
}
