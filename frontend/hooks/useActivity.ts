"use client";
import { useEffect, useState } from "react";
import { apiEnabled } from "../lib/api/config";
import { apiGet } from "../lib/api/client";
import type { FeedEntry } from "../lib/api/types";
import { getActivity, type ActivityItem } from "../lib/vault/data";
import { useWallet } from "./useWallet";
import { useVault } from "./useVault";

/**
 * The Activity feed — Home, `/account/activity`, and the desktop drawer (R6 · STE-42).
 *
 * Two honest sources, like `useBuckets` (KTD4): with the API configured and a wallet connected the rows
 * come from `GET /activity?depositor=…`, which merges the agent's own log with the user's decoded
 * on-chain actions. With the API off — or the wallet absent, or the read failed — the local fixture
 * renders, so the offline demo and the Playwright baseline still have a feed (R11).
 *
 * Realtime is the same 15s poll as `useHoldings` (KTD7): Stellar RPC does not stream, so the backend
 * polls the chain and we poll the backend.
 */

/** How often a mounted feed re-reads the backend. Mirrors `HOLDINGS_POLL_MS`. */
export const ACTIVITY_POLL_MS = 15_000;

/**
 * "3h ago", from a timestamp the backend sent and a clock read **after mount**. Rendering a relative
 * time during SSR would bake the server's clock into the HTML and desync the first client paint (KTD7).
 * A row whose `ts` the source never carried gets no time rather than a fabricated one.
 */
export function relativeTime(ts: number | undefined, now: number): string {
  if (ts === undefined) return "";
  const minutes = Math.floor(Math.max(0, now - ts) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/**
 * A backend feed row becomes a rendered row. `actor` is the tab filter — `'you'` is the user's own
 * action, everything else is the agent — and `kind` drives the two affordances the list has: a freeze
 * is flagged, a proposed exit is reviewable. No risk, label, score or tier crosses this boundary,
 * because the backend carries none.
 */
export function itemFromEntry(entry: FeedEntry, now: number): ActivityItem {
  return {
    id: entry.seq,
    cat: entry.actor === "you" ? "you" : "auto",
    kind: entry.kind,
    detail: entry.detail,
    when: relativeTime(entry.ts, now),
    ...(entry.kind === "froze" ? { flag: true } : {}),
    ...(entry.kind === "proposed-exit" ? { review: true } : {}),
  };
}

export function useActivity(): { loading: boolean; items: ActivityItem[] } {
  const { address } = useWallet();
  // A deposit or withdrawal made this session bumps the version — the row for it should appear without
  // waiting out the poll interval.
  const { version } = useVault();
  const [items, setItems] = useState<ActivityItem[] | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    // Offline polls nothing (the fixture never changes), so no timer outlives a test.
    if (!apiEnabled() || !address) return;
    const id = setInterval(() => setTick((t) => t + 1), ACTIVITY_POLL_MS);
    return () => clearInterval(id);
  }, [address]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // `Date.now()` inside the effect: client-only, never during render (KTD7).
      const now = Date.now();
      if (!apiEnabled() || !address) {
        if (!cancelled) setItems(getActivity());
        return;
      }
      const result = await apiGet<FeedEntry[]>("/activity", { depositor: address });
      if (cancelled) return;
      if (!result.ok) {
        // Never swallowed, never fatal: a dead backend shows the fixture, not an empty feed — an empty
        // feed reads as "nothing has happened", which is a different claim than "we could not read".
        console.error(`[activity] ${result.code}: ${result.message}`);
        setItems(getActivity());
        return;
      }
      // The backend already ordered the feed most-recent-first (by its monotonic `seq`).
      setItems(result.value.map((entry) => itemFromEntry(entry, now)));
    })();
    return () => {
      cancelled = true;
    };
  }, [address, version, tick]);

  return { loading: items === null, items: items ?? [] };
}
