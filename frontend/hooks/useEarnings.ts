"use client";
import { useEffect, useMemo, useState } from "react";
import { MockVaultClient, type Currency } from "@sorosense/vault-client";
import { useBuckets } from "./useBuckets";
import { useVault } from "./useVault";
import { useWallet } from "./useWallet";
import { apiEnabled } from "../lib/api/config";
import { apiGet, toBigInt } from "../lib/api/client";
import type { EarningsResponse } from "../lib/api/types";
import { getContributions } from "../lib/vault/contributions";
import { getFxRateToUsd, isActiveBucketCurrency } from "../lib/vault/data";
import { UNIT } from "../lib/vault/units";
import { buildEarningsFixture, type ChartPoint, type MonthlyEarned } from "../lib/earnings/fixtures";

/**
 * Re-exported so consumers (`GrowthCard`, `MonthlyBreakdown`, `DesktopOverview`) depend on this hook's
 * seam rather than on whichever source currently backs it. The shape is the backend's wire shape
 * (`lib/api/types.ts`), which the offline fixture also emits — so one chart component feeds both modes.
 */
export type { ChartPoint, MonthlyEarned };

/** Per-bucket drill-down. Mirrors `BucketBreakdown` in `backend/src/api/earnings.ts`. */
export interface BucketBreakdown {
  currency: Currency;
  /** Asset value in the bucket's own currency. */
  nativeValue: bigint;
  /** Display-only USD conversion of `nativeValue` — never a fund conversion. */
  usdValue: number;
  earnedUsd: number;
}

/** Mirrors `EarningsView` in the backend. No risk/label/score field, by design (R11). */
export interface EarningsView {
  hasDeposit: boolean;
  balanceUsd: number;
  apy: number;
  earnedUsd: number;
  buckets: BucketBreakdown[];
  chart: ChartPoint[];
  monthly: MonthlyEarned[];
}

const EMPTY: EarningsView = {
  hasDeposit: false, balanceUsd: 0, apy: 0, earnedUsd: 0, buckets: [], chart: [], monthly: [],
};

/** How often a mounted Earn surface re-reads the backend. Mirrors `HOLDINGS_POLL_MS` (KTD7). */
export const EARNINGS_POLL_MS = 15_000;

/**
 * A 200 whose body is not an earnings view is a failed read, not a crash. `client.ts` guarantees the
 * body is *JSON*; only the caller knows what shape it was supposed to be, so the check lives here — and
 * a wrong-shaped body must degrade to the offline fallback exactly like a 503 would, rather than
 * throwing `undefined.map` into a render.
 */
function isEarningsResponse(body: unknown): body is EarningsResponse {
  if (typeof body !== "object" || body === null) return false;
  const view = body as Partial<EarningsResponse>;
  return (
    typeof view.balanceUsd === "number" &&
    typeof view.earnedUsd === "number" &&
    Array.isArray(view.buckets) &&
    Array.isArray(view.chart) &&
    Array.isArray(view.monthly)
  );
}

/**
 * The backend's response **is** the view (R8). The only transformation is the documented edge decode of
 * the `bigint` field, which arrives as a decimal string — `Number()` would corrupt it past ~900M base
 * units. Nothing else is recomputed: the USD blend is the live oracle's, the cost basis was
 * reconstructed from chain events, and `earnedUsd` is whatever the chain actually supports (today: 0).
 */
function viewFromResponse(res: EarningsResponse): EarningsView {
  return {
    hasDeposit: res.hasDeposit,
    balanceUsd: res.balanceUsd,
    apy: res.apy,
    earnedUsd: res.earnedUsd,
    buckets: res.buckets
      .filter((b) => isActiveBucketCurrency(b.currency))
      .map((b) => ({
        currency: b.currency,
        nativeValue: toBigInt(b.nativeValue),
        usdValue: b.usdValue,
        earnedUsd: b.earnedUsd,
      })),
    chart: res.chart,
    monthly: res.monthly,
  };
}

/**
 * The Earn screen's single data seam. **Two honest sources, one shape (KTD4 · R8 · R10 · R11):**
 *
 *  - **Real mode** (`apiEnabled()` and the read landed) ⇒ `GET /earnings?depositor=…` verbatim. The
 *    backend reconstructs cost basis from decoded chain events and blends to USD with the live
 *    Reflector rate, so there is nothing left for the browser to derive — and `lib/vault/contributions.ts`
 *    is not consulted at all.
 *  - **Offline** (API unset, or the read failed) ⇒ today's hybrid: the headline live from the vault
 *    seam, the timeline shape from `buildEarningsFixture`. A backend that dies mid-demo degrades the
 *    Earn screen to fixtures, never to a blank one.
 *
 * **What the numbers mean in real mode, stated out loud.** An **unallocated** bucket has not accrued:
 * `share_price` reads exactly `SHARE_PRICE_SCALE`, so `earnedUsd` is **0** and the growth chart is flat —
 * an honest "no earnings yet" zero-state, not a broken chart. Once the keeper allocates the bucket into an
 * accruing `yield_pool` (vault binver 1.3.0, mark-to-market NAV), `share_price` rises with ledger time and
 * both the growth chart and `earnedUsd` curve up with it. The *value* chart also steps on real deposits and
 * withdrawals. We never fabricate growth on an unaccrued bucket — and never flatten a real gain back to 0.
 */
export function useEarnings(): { loading: boolean; view: EarningsView } {
  const { address } = useWallet();
  const { loading: bucketsLoading, buckets, totalUsd } = useBuckets();
  const { client, version } = useVault();

  const [remote, setRemote] = useState<{ loading: boolean; view: EarningsView | null }>({
    loading: apiEnabled(),
    view: null,
  });
  // Ticks the poll — somebody else's write (the keeper, a freeze, another device), as opposed to
  // `version`, which is ours. Both must land on screen without a reload.
  const [tick, setTick] = useState(0);

  // `Date.now()` after mount only — reading it during render would desync SSR and client (KTD7).
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(Date.now());
  }, []);

  useEffect(() => {
    // Offline polls nothing: no request to repeat, and no timer left running behind a test.
    if (!apiEnabled() || !address) return;
    const id = setInterval(() => setTick((t) => t + 1), EARNINGS_POLL_MS);
    return () => clearInterval(id);
  }, [address]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!apiEnabled() || !address) {
        if (!cancelled) setRemote({ loading: false, view: null });
        return;
      }
      const result = await apiGet<unknown>("/earnings", { depositor: address });
      if (cancelled) return;
      if (!result.ok || !isEarningsResponse(result.value)) {
        // Never swallowed, never fatal: the caller falls back to the offline hybrid rather than
        // rendering a blank Earn screen — or, worse, a silent $0 that reads as a real balance.
        const reason = result.ok ? "parse: /earnings body is not an earnings view" : `${result.code}: ${result.message}`;
        console.error(`[earnings] ${reason}`);
        setRemote({ loading: false, view: null });
        return;
      }
      // A poll never re-enters the loading state: the screen already has numbers on it.
      setRemote({ loading: false, view: viewFromResponse(result.value) });
    })();
    return () => {
      cancelled = true;
    };
  }, [address, version, tick]);

  const live = apiEnabled() && remote.view !== null;
  // The hybrid runs only when it is what will render. In real mode it must not even be *computed* —
  // `getContributions` below is a browser-memory ledger, and consulting it against a chain-sourced
  // response is the re-derivation R8 exists to remove.
  const useOffline = !apiEnabled() || (!remote.loading && remote.view === null);

  /**
   * The offline cost basis is only a cost basis for the client that recorded it. `getContributions` is
   * a **browser-memory ledger**: it does not survive a reload, so against a real chain client
   * `value − contributions` renders the user's entire principal as profit — the exact bug this plan
   * kills on the backend. And there is nothing to derive anyway: `share_price` is pinned to the scale,
   * so native yield is exactly zero. So the hybrid derives earnings only for the mock (which genuinely
   * accrues, via `simulateYield`); for a real client with no backend to answer for it, we do not know,
   * and "we do not know" must never be rendered as "profit" (R10).
   */
  const mockLedger = client instanceof MockVaultClient;

  const offlineView = useMemo<EarningsView>(() => {
    if (!useOffline || now === null) return EMPTY;

    const breakdown: BucketBreakdown[] = buckets.map((b) => {
      const fx = getFxRateToUsd(b.currency);
      const earnedNative = mockLedger ? Number(b.value - getContributions(b.currency)) / Number(UNIT) : 0;
      return {
        currency: b.currency,
        nativeValue: b.value,
        usdValue: b.valueUsd,
        // Earned is native yield converted for display; FX movement is never earnings.
        earnedUsd: Math.max(0, earnedNative * fx),
      };
    });

    const balanceUsd = totalUsd;
    const earnedUsd = breakdown.reduce((s, b) => s + b.earnedUsd, 0);
    const apy = balanceUsd > 0 ? buckets.reduce((s, b) => s + b.valueUsd * b.apy, 0) / balanceUsd : 0;

    // The fixture is stretched onto the live figures, so the hero, the chart's last point and the
    // monthly sum are one number seen three ways.
    const { chart, monthly } = buildEarningsFixture(now, { balanceUsd, earnedUsd });
    return { hasDeposit: buckets.length > 0, balanceUsd, apy, earnedUsd, buckets: breakdown, chart, monthly };
  }, [useOffline, buckets, totalUsd, now, mockLedger]);

  if (live) return { loading: false, view: remote.view! };
  // Real mode still resolving: show the skeleton rather than flashing the fixture and swapping it for
  // the backend's numbers a tick later.
  if (apiEnabled() && remote.loading) return { loading: true, view: EMPTY };
  return { loading: bucketsLoading || now === null, view: offlineView };
}
