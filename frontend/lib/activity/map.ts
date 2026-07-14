/**
 * `FeedEntry` (the backend's wire row) → `ActivityItem` (the rendered row). Pure and deterministic:
 * no React, no browser, no clock of its own — the caller passes `now` in, because reading it during
 * render would bake a timestamp into the SSR HTML and desync the first client paint (KTD7).
 *
 * It lives outside `useActivity` so the HTTP contract test can drive it over a **real** backend
 * response in a node environment, where the hook (which reaches the wallet provider) cannot be
 * imported. Same discipline as the backend's own pure derivations (`cost-basis.ts`).
 */

import type { FeedEntry } from "../api/types";
import type { ActivityItem } from "../vault/data";

/**
 * "3h ago". A row whose source never carried a `ts` gets no time rather than a fabricated one — and a
 * backend clock a little ahead of the browser's renders "just now", never "-1m ago".
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
 * One feed row, as rendered. `actor` is the tab filter — `'you'` is the user's own action, everything
 * else is the agent — and `kind` drives the two affordances the list has: a freeze is flagged, a
 * proposed exit is reviewable.
 *
 * The fields are named explicitly rather than spread, so no risk/label/score/tier field could reach a
 * user surface even if one appeared on the wire. The backend carries none.
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
