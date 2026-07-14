"use client";
import { useEffect, useState } from "react";
import { apiEnabled } from "../lib/api/config";
import { apiGet } from "../lib/api/client";
import type { Rate } from "../lib/api/types";

/**
 * `GET /rates` — the backend's rate card for a bucket the user has **not funded** (R13 · KTD3).
 *
 * `getHoldings` omits a zero-share bucket, correctly — there is no holding to report. But the Earn
 * empty-state hero and the simulator still have to quote a rate, and until this route landed the only
 * place left to read it was `BUCKET_META`. This is that number, sourced from the same vetted catalog the
 * keeper allocates against, so the rate a user is *promised* before depositing is the rate the agent
 * would actually chase.
 *
 * Like `/funding` and unlike `/holdings`, it carries **no per-user state**, so KTD4 does not apply: a
 * mock-mode backend answers it as truthfully as a live one, and no wallet is needed to read it.
 *
 * Fail-soft (KTD2): API unset ⇒ no request at all and `rates` stays `null`; a failed read logs and also
 * yields `null` — which `useApy` reads as "fall back to `BUCKET_META`", never as "render 0.00%".
 */

/**
 * In-flight de-duplication. Several surfaces resolve an APY in the same tick (the Earn hero, its
 * simulator, `useBuckets`), and each mounts this hook; without this they would issue identical GETs.
 * Cleared on settle, so a remount always refetches (and no state leaks between tests).
 */
let inFlight: Promise<Rate[] | null> | null = null;

function fetchRates(): Promise<Rate[] | null> {
  if (inFlight) return inFlight;

  const request = apiGet<Rate[]>("/rates")
    .then((result) => {
      if (result.ok) return result.value;
      // Never swallowed, never fatal: the caller renders the fixture rate instead of a blank or a 0%.
      console.error(`[rates] ${result.code}: ${result.message}`);
      return null;
    })
    .finally(() => {
      inFlight = null;
    });

  inFlight = request;
  return request;
}

/** The rate card per currency, or `null` when the API is off or the read failed. */
export function useRates(): { loading: boolean; rates: Rate[] | null } {
  const [state, setState] = useState<{ loading: boolean; rates: Rate[] | null }>({
    loading: apiEnabled(),
    rates: null,
  });

  useEffect(() => {
    let cancelled = false;
    // Client-only (KTD7): the request lives in the effect, never at module scope.
    void (async () => {
      if (!apiEnabled()) {
        if (!cancelled) setState({ loading: false, rates: null });
        return;
      }
      const rates = await fetchRates();
      if (!cancelled) setState({ loading: false, rates });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
