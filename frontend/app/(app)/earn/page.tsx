"use client";
import { useState } from "react";
import type { Currency } from "@sorosense/vault-client";
import { Button } from "../../../components/ui";
import { BucketToggle } from "../../../components/bucket/BucketToggle";
import { GrowthCard } from "../../../components/earn/GrowthCard";
import { Simulator } from "../../../components/simulator/Simulator";
import { useEarnings } from "../../../hooks/useEarnings";
import { useNav } from "../../../hooks/useNav";
import { getBucketMeta } from "../../../lib/vault/data";

const usd = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function EarnPage() {
  const nav = useNav();
  const { loading, view } = useEarnings();
  const [currency, setCurrency] = useState<Currency>("USD");
  const [i, setI] = useState(0);

  if (loading) {
    return <div className="py-[30px] text-center text-sm text-muted">Loading…</div>;
  }

  if (!view.hasDeposit) {
    return (
      <div>
        <div className="pb-[18px] pt-0.5 text-center">
          <div className="text-[15px] font-medium text-muted">Earn balance</div>
          <div
            data-testid="earn-balance"
            className="mt-2 text-[54px] font-semibold leading-none tracking-[-.02em] [font-variant-numeric:tabular-nums]"
          >
            $0.00
          </div>
          {/* `.yield` in mock-2: the rate is a gain, so it carries the positive accent, not muted grey. */}
          <div className="mt-3.5 flex items-center justify-center gap-2 text-[14px] font-semibold text-pos">
            <span aria-hidden="true" className="flex items-end gap-[3px]">
              <i className="block h-[6px] w-[4px] rounded-[1px] bg-pos" />
              <i className="block h-[10px] w-[4px] rounded-[1px] bg-pos" />
              <i className="block h-[14px] w-[4px] rounded-[1px] bg-pos" />
            </span>
            <span data-testid="hero-apy" className="[font-variant-numeric:tabular-nums]">
              {getBucketMeta(currency).apy.toFixed(2)}% APY
            </span>
          </div>
        </div>
        <Button onClick={() => nav.forward("/add-funds")}>Start earning</Button>
        <p className="my-3 text-center text-[13px] text-muted">No lockup, move to your wallet anytime</p>
        <Simulator currency={currency} onCurrencyChange={setCurrency} />
      </div>
    );
  }

  const views = [
    { name: "All buckets", currency: undefined, earned: view.earnedUsd, balance: view.balanceUsd, apy: view.apy },
    ...view.buckets.map((b) => ({
      name: getBucketMeta(b.currency).name,
      currency: b.currency,
      earned: b.earnedUsd,
      balance: b.usdValue,
      apy: getBucketMeta(b.currency).apy,
    })),
  ];
  const index = Math.min(i, views.length - 1);
  const v = views[index] ?? views[0]!;

  // The fixture's last chart point is stamped with the same `now` the hook used — reusing it keeps
  // the card's month labels in lockstep with the series instead of calling Date.now() twice.
  const now = view.chart[view.chart.length - 1]?.ts ?? 0;

  return (
    <div>
      <div className="py-[30px] text-center">
        <div className="text-[15px] font-medium text-muted">Total earned</div>
        <div className="mt-2 text-[54px] font-semibold leading-none tracking-[-.02em] [font-variant-numeric:tabular-nums]">
          {usd(v.earned)}
        </div>
        <div className="mt-3 text-[13.5px] text-muted [font-variant-numeric:tabular-nums]">
          {usd(v.balance)} balance · {v.apy.toFixed(2)}% APY
        </div>
        <BucketToggle views={views} index={index} onCycle={() => setI((n) => (n + 1) % views.length)} />
      </div>
      <div className="mb-5 flex gap-3">
        <Button onClick={() => nav.forward("/add-funds")}>Deposit</Button>
        <Button variant="glass" onClick={() => nav.forward("/withdraw")}>Move to wallet</Button>
      </div>
      <GrowthCard chart={view.chart} monthly={view.monthly} now={now} />
    </div>
  );
}
