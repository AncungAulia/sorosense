"use client";
import { useEffect, useMemo, useState } from "react";
import type { Currency } from "@sorosense/vault-client";
import { useWallet } from "./useWallet";
import { useVault } from "./useVault";
import { useApyResolver } from "./useApy";
import { getBucketMeta, getFxRateToUsd } from "../lib/vault/data";
import { UNIT } from "../lib/vault/units";

const CURRENCIES: readonly Currency[] = ["USD", "EUR", "MXN"];

export interface BucketView {
  currency: Currency;
  name: string;
  venue: string;
  tags: string[];
  apy: number;
  shares: bigint;
  value: bigint; // value in base units of the bucket currency
  valueUsd: number; // display-only blended USD
  frozen: boolean; // active pool paused
}

/**
 * Home's bucket rows. **Shares / value / frozen come from the seam, never from `GET /holdings`** — they
 * are per-user vault state that the browser's own client owns, and in mock mode the backend's vault is
 * a *different in-memory instance* with none of this session's deposits in it (sourcing them over HTTP
 * would blank the demo's Home screen). Only the APY — catalog-derived and user-independent — crosses
 * the HTTP seam, through `useApyResolver` (KTD3).
 */
export function useBuckets(): { loading: boolean; error: string | null; buckets: BucketView[]; totalUsd: number } {
  const { address } = useWallet();
  const { client, version } = useVault();
  const apyOf = useApyResolver();
  const [state, setState] = useState<{ loading: boolean; error: string | null; buckets: BucketView[] }>({
    loading: true,
    error: null,
    buckets: [],
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!address) {
        if (!cancelled) setState({ loading: false, error: null, buckets: [] });
        return;
      }
      try {
        const out: BucketView[] = [];
        for (const currency of CURRENCIES) {
          const shares = await client.balanceOf(address, currency);
          if (shares <= 0n) continue;
          const value = await client.assetValueOf(address, currency);
          const pool = await client.activePool(currency);
          const frozen = pool ? (await client.poolStatus(pool)) === "frozen" : false;
          const meta = getBucketMeta(currency);
          const valueUsd = (Number(value) / Number(UNIT)) * getFxRateToUsd(currency);
          out.push({ ...meta, shares, value, valueUsd, frozen });
        }
        if (!cancelled) setState({ loading: false, error: null, buckets: out });
      } catch (e) {
        if (!cancelled) setState({ loading: false, error: (e as Error).message, buckets: [] });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [address, client, version]);

  // The seam's rows carry `meta.apy` (the fixture) as their fallback; the resolver overrides it with the
  // backend's rate the moment `/holdings` lands, with no second read of the vault.
  const buckets = useMemo(
    () => state.buckets.map((b) => ({ ...b, apy: apyOf(b.currency) })),
    [state.buckets, apyOf],
  );
  const totalUsd = buckets.reduce((sum, b) => sum + b.valueUsd, 0);
  return { loading: state.loading, error: state.error, buckets, totalUsd };
}
