/**
 * The one knob that connects the frontend to the backend read surface (STE-52b, KTD2).
 *
 * Next inlines NEXT_PUBLIC_* at build time — the same pattern `lib/wallet.ts:12` uses for
 * NEXT_PUBLIC_E2E — so an unset var makes every API branch statically dead: the app keeps its local
 * derivations (`BUCKET_META`, `getWalletBalance`) and issues **no request at all**. That is what keeps
 * vitest and Playwright offline, and what lets a backend that dies mid-demo degrade the app to
 * fixtures instead of breaking it.
 *
 * There is deliberately **no default base URL**: falling back to `http://localhost:8787` would make a
 * production build hammer a host that isn't there. Absent var ⇒ the API is off, full stop.
 */

/** Raw value of the only config var. Empty string when unset (dev default, vitest, Playwright). */
const RAW_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

/** Backend read-surface origin, without a trailing slash. `""` when the API is not configured. */
export const API_BASE_URL = RAW_BASE_URL.replace(/\/+$/, "");

/** Deadline for every request, so a hung backend cannot wedge a render (KTD2). */
export const API_TIMEOUT_MS = 5_000;

/** True only when `NEXT_PUBLIC_API_URL` is set. Every caller checks this before reaching for the API. */
export function apiEnabled(): boolean {
  return API_BASE_URL !== "";
}
