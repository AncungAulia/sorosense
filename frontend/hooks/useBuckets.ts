"use client";
import { useEffect, useState } from "react";
import type { Currency } from "@sorosense/vault-client";
import { useWallet } from "./useWallet";
import { useVault } from "./useVault";
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

export function useBuckets(): { loading: boolean; error: string | null; buckets: BucketView[]; totalUsd: number } {
  const { address } = useWallet();
  const { client, version } = useVault();
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

  const totalUsd = state.buckets.reduce((sum, b) => sum + b.valueUsd, 0);
  return { ...state, totalUsd };
}
