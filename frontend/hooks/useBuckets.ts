"use client";
import { useEffect, useMemo, useState } from "react";
import type { Currency } from "@sorosense/vault-client";
import { useWallet } from "./useWallet";
import { useVault } from "./useVault";
import { apyFrom } from "./useApy";
import { useHoldings } from "./useHoldings";
import { apiEnabled } from "../lib/api/config";
import { toBigInt } from "../lib/api/client";
import type { Holding } from "../lib/api/types";
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

/** A backend `/holdings` row, as sent, becomes a row as rendered. `shares`/`value` are decimal strings
 *  on the wire — `toBigInt` decodes them losslessly, which `Number()` would not past ~900M base units. */
function rowFromHolding(h: Holding): BucketView {
  return {
    currency: h.currency,
    name: h.name,
    venue: h.venue,
    tags: h.tags,
    apy: h.apy,
    shares: toBigInt(h.shares),
    value: toBigInt(h.value),
    // The backend already blended this with the live Reflector rate. Re-deriving it here from
    // `getFxRateToUsd` would overwrite a real oracle read with a constant from 2026.
    valueUsd: h.valueUsd,
    frozen: h.frozen,
  };
}

/**
 * Home's bucket rows. **Two honest sources, one shape (KTD4 · R5):**
 *
 *  - **Real mode** (`apiEnabled()` and the read landed) ⇒ the whole row comes from `GET /holdings`:
 *    name, venue, tags, APY, shares, value, and the blended `valueUsd` the backend computed from the
 *    live oracle. The browser and the backend read the same chain, so there is nothing to reconcile.
 *  - **Offline mode** (API unset, or the read failed) ⇒ the vault seam plus `BUCKET_META` and the
 *    fixture FX, exactly as before. This is not a nicety: in mock mode the browser's `MockVaultClient`
 *    and a mock-mode backend are *different in-memory instances*, so a deposit made in the browser this
 *    session does not exist in the backend's mock — sourcing balances over HTTP would render Home
 *    **blank**. The same gate makes a backend that dies mid-demo degrade to fixtures instead of a blank
 *    screen.
 *
 * The seam read therefore runs in both modes: in real mode it is the fallback that catches a 503.
 */
export function useBuckets(): { loading: boolean; error: string | null; buckets: BucketView[]; totalUsd: number } {
  const { address } = useWallet();
  const { client, version } = useVault();
  const { loading: holdingsLoading, holdings } = useHoldings();
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

  const buckets = useMemo(() => {
    // Real mode: the backend's rows verbatim.
    if (apiEnabled() && holdings !== null) return holdings.map(rowFromHolding);
    // Offline: the seam's rows, whose `meta.apy` is the fixture. `apyFrom(null, …)` resolves to that
    // same fixture, so this stays byte-for-byte today's behavior.
    return state.buckets.map((b) => ({ ...b, apy: apyFrom(holdings, b.currency) }));
  }, [state.buckets, holdings]);

  const totalUsd = buckets.reduce((sum, b) => sum + b.valueUsd, 0);
  // A real-mode surface waits for the read it is going to render. Showing the seam's rows first and
  // swapping them for the backend's a tick later would flash a different total at the user.
  const loading = state.loading || (apiEnabled() && holdingsLoading);
  return { loading, error: state.error, buckets, totalUsd };
}
