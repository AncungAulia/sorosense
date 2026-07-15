"use client";
import { useState } from "react";
import type { Currency } from "@sorosense/vault-client";
import { Button, Card, CountUp, Skeleton } from "../../../components/ui";
import { BucketToggle } from "../../../components/bucket/BucketToggle";
import { GrowthCard } from "../../../components/earn/GrowthCard";
import { Simulator } from "../../../components/simulator/Simulator";
import { useApyResolver } from "../../../hooks/useApy";
import { useEarnings } from "../../../hooks/useEarnings";
import { useNav } from "../../../hooks/useNav";
import { useRedirectDesktopToHome } from "../../../hooks/useRedirectDesktopToHome";
import { bucketLabel, isActiveBucketCurrency } from "../../../lib/vault/data";

const usd = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function EarnPage() {
  const nav = useNav();
  const { loading, view } = useEarnings();
  // The one APY accessor (R5 · R13): a funded bucket's rate comes from the backend's /holdings row, an
  // unfunded one (the empty-state hero, the simulator) from GET /rates. Both are the vetted catalog; the
  // fixture is reached only with the API off (KTD3).
  const apyOf = useApyResolver();
  const [currency, setCurrency] = useState<Currency>("USD");
  const [i, setI] = useState(0);
  // Earn is a mobile-only surface; a desktop visitor is redirected to the Overview (which absorbs it).
  if (useRedirectDesktopToHome()) return null;

  if (loading) {
    return (
      <div className="stagger">
        <div className="py-[30px] text-center">
          <Skeleton className="mx-auto h-4 w-24" />
          <Skeleton className="mx-auto mt-3 h-[44px] w-[200px] rounded-lg" />
        </div>
        <Card className="p-5">
          <Skeleton className="h-4 w-20" />
          <div className="mt-4 flex h-[118px] items-end gap-1.5">
            {[50, 70, 55, 76, 88, 62, 90, 80, 40].map((hgt, i) => (
              <Skeleton key={i} className="flex-1 rounded-t-md" style={{ height: `${hgt}%` }} />
            ))}
          </div>
        </Card>
      </div>
    );
  }

  if (!view.hasDeposit) {
    return (
      <div className="stagger">
        <div className="pb-[18px] pt-0.5 text-center">
          <div className="text-[15px] font-medium text-muted">Earn balance</div>
          <div
            data-testid="earn-balance"
            className="mt-2 text-[54px] font-semibold leading-none tracking-[-.02em] [font-variant-numeric:tabular-nums]"
          >
            <CountUp animateOnMount value={0} format={usd} />
          </div>
          {/* `.yield` in mock-2: the rate is a gain, so it carries the positive accent, not muted grey. */}
          <div className="mt-3.5 flex items-center justify-center gap-2 text-[14px] font-semibold text-pos">
            <span aria-hidden="true" className="flex items-end gap-[3px]">
              <i className="block h-[6px] w-[4px] rounded-[1px] bg-pos" />
              <i className="block h-[10px] w-[4px] rounded-[1px] bg-pos" />
              <i className="block h-[14px] w-[4px] rounded-[1px] bg-pos" />
            </span>
            <span data-testid="hero-apy" className="[font-variant-numeric:tabular-nums]">
              {apyOf(currency).toFixed(2)}% APY
            </span>
          </div>
        </div>
        <Button onClick={() => nav.forward("/deposit")}>Start earning</Button>
        <p className="my-3 text-center text-[13px] text-muted">No lockup, move to your wallet anytime</p>
        <Simulator currency={currency} apy={apyOf(currency)} onCurrencyChange={setCurrency} />
      </div>
    );
  }

  const views = [
    // `view.apy` is the value-weighted blend of the same per-bucket rates (useBuckets already resolves
    // them through useApy), so the "All buckets" row and each bucket row agree by construction.
    { name: "All buckets", currency: undefined, earned: view.earnedUsd, balance: view.balanceUsd, apy: view.apy },
    ...view.buckets
      .filter((b) => isActiveBucketCurrency(b.currency))
      .map((b) => ({
        name: bucketLabel(b.currency),
        currency: b.currency,
        earned: b.earnedUsd,
        balance: b.usdValue,
        apy: apyOf(b.currency),
      })),
  ];
  const index = Math.min(i, views.length - 1);
  const v = views[index] ?? views[0]!;

  // The fixture's last chart point is stamped with the same `now` the hook used — reusing it keeps
  // the card's month labels in lockstep with the series instead of calling Date.now() twice.
  const now = view.chart[view.chart.length - 1]?.ts ?? 0;

  return (
    <div className="stagger">
      <div className="py-[30px] text-center">
        <div className="text-[15px] font-medium text-muted">Total earned</div>
        <CountUp animateOnMount value={v.earned} format={usd} className="mt-2 block text-[54px] font-semibold leading-none tracking-[-.02em] [font-variant-numeric:tabular-nums]" />
        <div className="mt-3 text-[13.5px] text-muted [font-variant-numeric:tabular-nums]">
          <CountUp animateOnMount value={v.balance} format={usd} /> balance · {v.apy.toFixed(2)}% APY
        </div>
        <BucketToggle views={views} index={index} onCycle={() => setI((n) => (n + 1) % views.length)} />
      </div>
      <div className="mb-5 flex gap-3">
        <Button onClick={() => nav.forward("/deposit")}>Deposit</Button>
        <Button variant="glass" onClick={() => nav.forward("/withdraw")}>Withdraw</Button>
      </div>
      <GrowthCard chart={view.chart} monthly={view.monthly} now={now} />
    </div>
  );
}
