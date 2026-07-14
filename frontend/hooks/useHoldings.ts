"use client";
import { useEffect, useState } from "react";
import { apiEnabled } from "../lib/api/config";
import { apiGet } from "../lib/api/client";
import type { Holding } from "../lib/api/types";
import { useVault } from "./useVault";
import { useWallet } from "./useWallet";

/**
 * `GET /holdings?depositor=…` — the backend's composed per-currency read (STE-52a, KTD1).
 *
 * **In real mode this is the whole bucket row** — name, venue, tags, APY, value and the blended USD —
 * because the browser and the backend then read the same chain. **In mock mode only the APY is taken**
 * (catalog-derived, user-independent): the browser's `MockVaultClient` and a mock-mode backend are
 * *different in-memory instances*, so sourcing this session's balances over HTTP would blank the demo's
 * Home screen. `useBuckets` owns that fork (KTD4); do not "simplify" it away.
 *
 * Fail-soft (KTD2): API unset ⇒ no request at all and `holdings` stays `null`; a request that fails
 * logs and also yields `null`, which every consumer reads as "fall back to the local fixture".
 *
 * Realtime is a **poll**, not a push (KTD7): the upstream source is Stellar RPC, which has no event
 * streaming, so an SSE hop would add a failure mode without adding freshness. The backend polls the
 * chain; we poll the backend.
 */

/**
 * In-flight de-duplication. A funded Earn page mounts `useHoldings` twice in the same tick (once via
 * `useBuckets`, once for the page's own APY resolver); without this they would issue two identical
 * GETs. Cleared on settle, so a remount always refetches.
 */
const inFlight = new Map<string, Promise<Holding[] | null>>();

function fetchHoldings(depositor: string, version: number): Promise<Holding[] | null> {
  // Keyed by version too: two hooks in the same tick share one request, but a vault write (which bumps
  // the version) always gets a fresh read — it must never be served a reply that is already in flight
  // against the pre-write state.
  const key = `${depositor}:${version}`;
  const pending = inFlight.get(key);
  if (pending) return pending;

  const request = apiGet<Holding[]>("/holdings", { depositor })
    .then((result) => {
      if (result.ok) return result.value;
      // Never swallowed, never fatal: the caller renders the fixture rate instead of a blank/NaN.
      console.error(`[holdings] ${result.code}: ${result.message}`);
      return null;
    })
    .finally(() => inFlight.delete(key));

  inFlight.set(key, request);
  return request;
}

/**
 * How often a mounted surface re-reads the backend. The backend's own chain poll runs on a comparable
 * interval, so anything faster would mostly re-fetch a number that had not moved yet.
 */
export const HOLDINGS_POLL_MS = 15_000;

/** Funded buckets from the backend, or `null` when the API is off, the wallet is absent, or the read failed. */
export function useHoldings(): { loading: boolean; holdings: Holding[] | null } {
  const { address } = useWallet();
  // `version` bumps on every write through the seam (deposit / withdraw). Without it a bucket funded
  // *this session* would keep the fixture rate forever: at mount it had zero shares, so `getHoldings`
  // correctly omitted it — and two rows on the same screen would then be sourced from different truths.
  const { version } = useVault();
  // Ticks the poll. Separate from `version` because the two mean different things: `version` is *our*
  // write, `tick` is somebody else's — the keeper rebalancing, a Sentinel freeze, a deposit from another
  // device. Both must land on screen without a reload.
  const [tick, setTick] = useState(0);
  const [state, setState] = useState<{ loading: boolean; holdings: Holding[] | null }>({
    loading: apiEnabled(),
    holdings: null,
  });

  useEffect(() => {
    // Offline polls nothing: with the API off there is no request to repeat, and vitest/Playwright must
    // stay at zero network with no timer left running behind them.
    if (!apiEnabled() || !address) return;
    const id = setInterval(() => setTick((t) => t + 1), HOLDINGS_POLL_MS);
    return () => clearInterval(id);
  }, [address]);

  useEffect(() => {
    let cancelled = false;
    // Client-only (KTD7): the request lives in the effect, never at module scope.
    void (async () => {
      if (!apiEnabled() || !address) {
        if (!cancelled) setState({ loading: false, holdings: null });
        return;
      }
      const holdings = await fetchHoldings(address, version);
      // A poll never re-enters the loading state — the screen already has numbers on it, and blinking
      // them back to a skeleton every 15s is worse than showing the previous read for one more moment.
      if (!cancelled) setState({ loading: false, holdings });
    })();
    return () => {
      cancelled = true;
    };
  }, [address, version, tick]);

  return state;
}
