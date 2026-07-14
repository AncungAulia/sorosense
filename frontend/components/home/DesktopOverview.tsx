"use client";
import { useMemo, useState } from "react";
import { useBuckets } from "../../hooks/useBuckets";
import { useEarnings } from "../../hooks/useEarnings";
import { usePanel } from "../../hooks/usePanel";
import { formatCurrency } from "../../lib/vault/units";
import { Button, Card, Segmented, Skeleton } from "../ui";
import { useActivity } from "../../hooks/useActivity";
import { usePendingExit } from "../../hooks/usePendingExit";
import { BucketRow } from "../bucket/BucketRow";
import { ActivityList } from "../activity/ActivityList";
import { FreezeBar } from "../desktop/FreezeBar";
import { GrowthChart } from "../desktop/GrowthChart";
import { SafeExitDialog } from "../desktop/SafeExitDialog";
import { AddFundsDrawer } from "../desktop/AddFundsDrawer";
import { WithdrawDrawer } from "../desktop/WithdrawDrawer";
import { ActivityDrawer } from "../desktop/ActivityDrawer";
import { ValueChart } from "./ValueChart";

const RANGES = ["Day", "Week", "Month", "Year"] as const;
type Range = (typeof RANGES)[number];
const MODES = ["Total", "Earned"] as const;
type Mode = (typeof MODES)[number];

/** Range → (how far below the current value the series starts, point count, wobble amplitude). */
const RANGE_SHAPE: Record<Range, { drop: number; n: number; vol: number }> = {
  Day: { drop: 0.002, n: 48, vol: 0.9 },
  Week: { drop: 0.007, n: 60, vol: 1.8 },
  Month: { drop: 0.019, n: 40, vol: 3.2 },
  Year: { drop: 0.086, n: 52, vol: 7.0 },
};

/** Deterministic organic series ending exactly at `hi` (mock's genSeries, minus the random term). */
function organicSeries(n: number, lo: number, hi: number, vol: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 1 : i / (n - 1);
    const base = lo + (hi - lo) * t;
    const w = (Math.sin(i * 0.7) * 0.5 + Math.sin(i * 1.9 + 1) * 0.3 + Math.sin(i * 3.3) * 0.2) * vol;
    out.push(base + w);
  }
  if (n > 0) {
    out[0] = lo;
    out[n - 1] = hi;
  }
  return out;
}

const money = (v: number) => `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function DesktopOverview() {
  const { loading, buckets, totalUsd } = useBuckets();
  const { view } = useEarnings();
  const { panel, open, close } = usePanel();

  const [mode, setMode] = useState<Mode>("Total");
  const [range, setRange] = useState<Range>("Week");
  const [bucketIndex, setBucketIndex] = useState(0); // 0 = All buckets (blended); 1..n = each bucket
  const activity = useActivity();
  const pend = usePendingExit();

  // Selectable views: All (blended ≈USD) then one per bucket (native).
  const selectable = useMemo(() => {
    const all = {
      name: "All buckets",
      isAll: true as const,
      valueText: money(totalUsd),
      earnedUsd: view.earnedUsd,
      apy: view.apy,
      sub: ` · across ${buckets.length} bucket${buckets.length === 1 ? "" : "s"}`,
    };
    const perBucket = buckets.map((b) => {
      const earned = view.buckets.find((x) => x.currency === b.currency)?.earnedUsd ?? 0;
      return {
        name: b.name,
        isAll: false as const,
        valueText: formatCurrency(b.value, b.currency),
        earnedUsd: earned,
        apy: b.apy,
        sub: ` · ${b.name}`,
      };
    });
    return [all, ...perBucket];
  }, [buckets, totalUsd, view]);

  const sel = selectable[Math.min(bucketIndex, selectable.length - 1)] ?? selectable[0]!;

  // "Earned this month" = the last (in-progress) monthly bucket, already scaled to real USD by useEarnings.
  const lastMonth = view.monthly.at(-1);
  const earnedThisMonth = lastMonth ? lastMonth.earnedUsd : 0;

  // Value-over-time series for the chart, anchored to the live total value.
  const series = useMemo(() => {
    const hi = totalUsd > 0 ? totalUsd : 0;
    const shape = RANGE_SHAPE[range];
    const lo = hi * (1 - shape.drop);
    return organicSeries(shape.n, lo, hi, shape.vol);
  }, [totalUsd, range]);

  const headline = mode === "Total" ? sel.valueText : money(sel.earnedUsd);

  return (
    <>
      {pend && <FreezeBar onReview={() => open("safe-exit")} />}

      <section className="mb-4 grid grid-cols-[minmax(290px,0.78fr)_1.3fr] overflow-hidden rounded-card border border-white bg-card [box-shadow:0_1px_2px_rgba(17,19,22,.03),0_14px_34px_-22px_rgba(17,19,22,.16)]" aria-label="Your value">
      {/* LEFT */}
      <div className="flex min-w-0 flex-col px-7 py-6">
        <div className="mb-[18px] flex items-center justify-between gap-3">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">Your value</span>
          <Segmented
            options={MODES}
            value={mode}
            onChange={setMode}
            label="Value or earned"
            variant="currency"
            fluid={false}
            className="shrink-0"
          />
        </div>

        {loading ? (
          <>
            <Skeleton className="mt-1 h-[46px] w-[210px] rounded-lg" />
            <Skeleton className="mt-4 h-[18px] w-[160px]" />
            <div className="mt-[22px] flex items-center justify-between py-[10px]">
              <Skeleton className="h-4 w-[110px]" />
              <Skeleton className="h-4 w-[80px]" />
            </div>
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-[clamp(38px,3.4vw,50px)] font-semibold leading-none tracking-[-.025em] [font-variant-numeric:tabular-nums]">{headline}</span>
              {mode === "Total" && (
                <span className="inline-flex h-6 items-center gap-1 rounded-full bg-[rgba(22,163,74,.12)] px-[9px] text-[12.5px] font-semibold text-pos [font-variant-numeric:tabular-nums]">
                  <svg viewBox="0 0 24 24" className="w-[13px] fill-none stroke-current [stroke-width:2]" aria-hidden><path d="M7 17 17 7M9 7h8v8" /></svg>
                  +{money(sel.earnedUsd)}
                </span>
              )}
              <button
                type="button"
                onClick={() => setBucketIndex((n) => (n + 1) % selectable.length)}
                aria-label="Switch bucket"
                className="grid h-[30px] w-[30px] place-items-center rounded-[9px] text-faint transition-colors hover:bg-pill hover:text-ink"
              >
                <svg viewBox="0 0 24 24" className="h-[19px] w-[19px] fill-none stroke-current [stroke-width:2.2] [stroke-linecap:round] [stroke-linejoin:round]" aria-hidden><path d="M8 9l4-4 4 4M8 15l4 4 4-4" /></svg>
              </button>
            </div>

            <div className="mt-3 text-[13.5px] [font-variant-numeric:tabular-nums]">
              <span className="text-pos">{sel.apy.toFixed(2)}% APY</span>
              <span className="text-muted">{sel.sub}</span>
              {sel.isAll && <span className="text-faint"> ≈ USD</span>}
            </div>

            <div className="mt-[22px] flex flex-col" aria-label="Breakdown">
              <div className="flex items-baseline justify-between gap-[14px] py-[10px]">
                <span className="text-[13px] text-muted">Earned this month</span>
                <span className="text-[14.5px] font-semibold tracking-[-.01em] text-pos [font-variant-numeric:tabular-nums]">
                  ~{money(earnedThisMonth)}
                  <span className="ml-0.5 text-xs font-medium text-faint"> USD</span>
                </span>
              </div>
            </div>
          </>
        )}

        <div className="mt-auto flex gap-2.5 pt-6">
          <Button className="flex-1" onClick={() => open("add-funds")}>Add funds</Button>
          <Button variant="glass" className="flex-1" onClick={() => open("move-to-wallet")}>Move to wallet</Button>
        </div>
      </div>

      {/* RIGHT */}
      <div className="flex min-w-0 flex-col gap-2 px-[26px] pb-[18px] pt-5">
        <Segmented
          options={RANGES}
          value={range}
          onChange={setRange}
          label="Range"
          variant="period"
          fluid={false}
          className="self-end"
        />
        <div className="relative min-h-[210px] flex-1">
          {loading ? <Skeleton className="absolute inset-0 rounded-xl" /> : <ValueChart data={series} />}
        </div>
      </div>
    </section>

      <div className="grid grid-cols-3 gap-4">
        {/* Buckets */}
        <Card className="flex flex-col px-5 py-[18px]" aria-label="Buckets">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-[13px] font-semibold text-muted">Buckets</h2>
          </div>
          {loading ? (
            <div className="flex flex-col gap-4 py-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center gap-[13px]">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="flex-1">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="mt-2 h-3 w-16" />
                  </div>
                  <Skeleton className="h-4 w-16" />
                </div>
              ))}
            </div>
          ) : buckets.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted">No buckets yet. Add funds to start.</div>
          ) : (
            buckets.map((b, i) => <BucketRow key={b.currency} bucket={b} first={i === 0} />)
          )}
        </Card>

        {/* Growth — monthly earnings bar chart (this year) */}
        <Card className="flex flex-col px-5 py-[18px]" aria-label="Growth">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-[13px] font-semibold text-muted">Growth</h2>
          </div>
          {loading ? (
            <div className="mt-2 flex h-[132px] items-end gap-[5px]">
              {[45, 68, 52, 74, 88, 63, 92, 82, 34].map((hgt, i) => (
                <Skeleton key={i} className="flex-1 rounded-t-[4px] rounded-b-[2px]" style={{ height: `${hgt}%` }} />
              ))}
            </div>
          ) : (
            <GrowthChart monthly={view.monthly} />
          )}
        </Card>

        {/* Agent activity */}
        <Card className="flex flex-col px-5 py-[18px]" aria-label="Agent activity">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-[13px] font-semibold text-muted">Agent activity</h2>
            <button
              type="button"
              onClick={() => open("activity")}
              className="inline-flex items-center gap-[3px] text-[12.5px] font-medium text-muted"
            >
              View all
              <svg viewBox="0 0 24 24" className="w-3.5 fill-none stroke-current [stroke-width:2] [stroke-linecap:round] [stroke-linejoin:round]" aria-hidden><path d="M9 6l6 6-6 6" /></svg>
            </button>
          </div>
          <ActivityList items={activity.slice(0, 3)} onReview={() => open("safe-exit")} reviewed={!pend} />
        </Card>
      </div>

      <SafeExitDialog open={panel === "safe-exit"} onClose={close} />

      <AddFundsDrawer open={panel === "add-funds"} onClose={close} />
      <WithdrawDrawer open={panel === "move-to-wallet"} onClose={close} />
      <ActivityDrawer open={panel === "activity"} onClose={close} onReview={() => open("safe-exit")} />
    </>
  );
}
