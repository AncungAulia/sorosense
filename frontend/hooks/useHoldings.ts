"use client";
import { useEffect, useState } from "react";
import { apiEnabled } from "../lib/api/config";
import { apiGet } from "../lib/api/client";
import type { Holding } from "../lib/api/types";
import { useWallet } from "./useWallet";

/**
 * `GET /holdings?depositor=…` — the backend's composed per-currency read (STE-52a, KTD1).
 *
 * Only **catalog-derived, user-independent** data is consumed from here (the APY, via `useApy`). The
 * per-user vault state (shares / value / frozen) deliberately keeps coming from the seam: in mock mode
 * the browser's `MockVaultClient` and a mock-mode backend are *different in-memory instances*, so
 * sourcing balances over HTTP would blank the demo's Home screen (the mock-divergence risk in the
 * plan). Do not "simplify" that away.
 *
 * Fail-soft (KTD2): API unset ⇒ no request at all and `holdings` stays `null`; a request that fails
 * logs and also yields `null`, which every consumer reads as "fall back to the local fixture".
 */

/**
 * In-flight de-duplication. A funded Earn page mounts `useHoldings` twice in the same tick (once via
 * `useBuckets`, once for the page's own APY resolver); without this they would issue two identical
 * GETs. Cleared on settle, so a remount always refetches.
 */
const inFlight = new Map<string, Promise<Holding[] | null>>();

function fetchHoldings(depositor: string): Promise<Holding[] | null> {
  const pending = inFlight.get(depositor);
  if (pending) return pending;

  const request = apiGet<Holding[]>("/holdings", { depositor })
    .then((result) => {
      if (result.ok) return result.value;
      // Never swallowed, never fatal: the caller renders the fixture rate instead of a blank/NaN.
      console.error(`[holdings] ${result.code}: ${result.message}`);
      return null;
    })
    .finally(() => inFlight.delete(depositor));

  inFlight.set(depositor, request);
  return request;
}

/** Funded buckets from the backend, or `null` when the API is off, the wallet is absent, or the read failed. */
export function useHoldings(): { loading: boolean; holdings: Holding[] | null } {
  const { address } = useWallet();
  const [state, setState] = useState<{ loading: boolean; holdings: Holding[] | null }>({
    loading: apiEnabled(),
    holdings: null,
  });

  useEffect(() => {
    let cancelled = false;
    // Client-only (KTD7): the request lives in the effect, never at module scope.
    void (async () => {
      if (!apiEnabled() || !address) {
        if (!cancelled) setState({ loading: false, holdings: null });
        return;
      }
      const holdings = await fetchHoldings(address);
      if (!cancelled) setState({ loading: false, holdings });
    })();
    return () => {
      cancelled = true;
    };
  }, [address]);

  return state;
}
