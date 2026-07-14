"use client";
import { useCallback } from "react";
import type { Currency } from "@sorosense/vault-client";
import type { Holding, Rate } from "../lib/api/types";
import { getBucketMeta } from "../lib/vault/data";
import { useHoldings } from "./useHoldings";
import { useRates } from "./useRates";

/**
 * The **one** APY accessor for every user surface (R5 · R13 · KTD3).
 *
 * Three sources, in strict order of authority — and with the API on, the fixture is never reached:
 *  1. a **funded** bucket takes its rate from the backend's `GET /holdings` row: that row names the pool
 *     the vault is *actually* allocated to, so it is the only source that can be right about a bucket
 *     the keeper has already moved;
 *  2. an **unfunded** bucket has no `/holdings` row (`getHoldings` skips zero-share buckets, correctly)
 *     and takes its rate from `GET /rates` — the same vetted catalog, resolved to the venue the agent
 *     *would* allocate it to. The Earn empty-state hero and the simulator quote this;
 *  3. only with the API off, or after a failed read, does `BUCKET_META` render (R11) — the offline demo
 *     and the Playwright baseline still need a number, and a fixture rate beats `NaN%`.
 *
 * The order matters and is not cosmetic: reading `/rates` first would quote a funded bucket the
 * *best-safe* venue's rate while its money sits in a different pool. Every call site (`useBuckets`, the
 * Earn hero, the per-bucket views, the simulator) goes through here, so there is one place to be right.
 */

/** Pure resolution: the funded row's rate, else the rate card's, else the offline fixture. Never `NaN`. */
export function apyFrom(
  holdings: Holding[] | null,
  rates: Rate[] | null,
  currency: Currency,
): number {
  // A rate that is not a finite number is a broken read, not a rate — fall through rather than render
  // "NaN% APY". Applies at every level, so a malformed row cannot poison the chain.
  const row = holdings?.find((h) => h.currency === currency);
  if (row && Number.isFinite(row.apy)) return row.apy;

  const card = rates?.find((r) => r.currency === currency);
  if (card && Number.isFinite(card.apy)) return card.apy;

  return getBucketMeta(currency).apy;
}

/**
 * A stable `(currency) => apy` resolver, for surfaces that need more than one bucket's rate
 * (`useBuckets`, the Earn page's bucket toggle). Stable across renders for a given `holdings`/`rates`,
 * so it is safe in a dependency array.
 */
export function useApyResolver(): (currency: Currency) => number {
  const { holdings } = useHoldings();
  const { rates } = useRates();
  return useCallback((currency: Currency) => apyFrom(holdings, rates, currency), [holdings, rates]);
}

/** One bucket's APY. */
export function useApy(currency: Currency): number {
  return useApyResolver()(currency);
}
