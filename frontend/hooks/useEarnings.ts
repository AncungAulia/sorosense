"use client";
import { useEffect, useMemo, useState } from "react";
import type { Currency } from "@sorosense/vault-client";
import { useBuckets } from "./useBuckets";
import { getContributions } from "../lib/vault/contributions";
import { getFxRateToUsd } from "../lib/vault/data";
import { UNIT } from "../lib/vault/units";
import { buildEarningsFixture, type ChartPoint, type MonthlyEarned } from "../lib/earnings/fixtures";

/**
 * Re-exported so consumers (`GrowthCard`, `MonthlyBreakdown`) depend on this hook's seam, not on the
 * fixture that currently backs it. When the backend is exposed over HTTP and `buildEarningsFixture`
 * is replaced, these types keep being defined wherever the real shape comes from — no consumer import
 * has to change.
 */
export type { ChartPoint, MonthlyEarned };

/**
 * Per-bucket drill-down. Mirrors `BucketBreakdown` in `backend/src/api/earnings.ts` and adds
 * `earnedUsd`, which the hero's BucketToggle needs and the backend has not yet exposed.
 */
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

/**
 * The Earn screen's single data seam. Hybrid on purpose: the headline is computed live from the vault
 * seam (so a deposit made this session shows up immediately), while `chart`/`monthly` come from a
 * fixture — the frontend has no share-price time series. The fixture is scaled by the live
 * `earnedUsd`, so the hero, the chart's last point, and the monthly sum agree.
 *
 * When the backend is exposed over HTTP, only this function's body changes; no component moves.
 */
export function useEarnings(): { loading: boolean; view: EarningsView } {
  const { loading, buckets, totalUsd } = useBuckets();

  // `Date.now()` after mount only — reading it during render would desync SSR and client (KTD7).
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(Date.now());
  }, []);

  const view = useMemo<EarningsView>(() => {
    if (now === null) return EMPTY;

    const breakdown: BucketBreakdown[] = buckets.map((b) => {
      const fx = getFxRateToUsd(b.currency);
      const earnedNative = Number(b.value - getContributions(b.currency)) / Number(UNIT);
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

    const fixture = buildEarningsFixture(now);
    return {
      hasDeposit: buckets.length > 0,
      balanceUsd,
      apy,
      earnedUsd,
      buckets: breakdown,
      chart: fixture.chart.map((p) => ({ ts: p.ts, earnedUsd: p.earnedUsd * earnedUsd })),
      monthly: fixture.monthly.map((m) => ({ label: m.label, earnedUsd: m.earnedUsd * earnedUsd })),
    };
  }, [buckets, totalUsd, now]);

  return { loading: loading || now === null, view };
}
