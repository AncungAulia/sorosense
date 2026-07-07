"use client";
import { useState } from "react";
import { Button } from "../../../components/ui";
import { BucketToggle } from "../../../components/bucket/BucketToggle";
import { useBuckets } from "../../../hooks/useBuckets";
import { useNav } from "../../../hooks/useNav";
import { UNIT } from "../../../lib/vault/units";
import { getContributions } from "../../../lib/vault/contributions";
import { getFxRateToUsd } from "../../../lib/vault/data";

const usd = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function EarnPage() {
  const nav = useNav();
  const { loading, buckets, totalUsd } = useBuckets();
  const [i, setI] = useState(0);

  // "Total earned" = current value − net contributions, blended to USD. Immune to
  // deposits/withdrawals; only moves with yield (Coinbase/Nexo/Kraken headline a lifetime
  // earned figure here, not APY — APY already lives on Home). Per-bucket + growth chart
  // land in U16 from the backend cost-basis; the frontend ledger mirrors it.
  const earnedOf = (currency: (typeof buckets)[number]["currency"], value: bigint) =>
    Math.max(0, (Number(value - getContributions(currency)) / Number(UNIT)) * getFxRateToUsd(currency));

  const views = [
    { name: "All buckets", currency: undefined, earned: buckets.reduce((s, b) => s + earnedOf(b.currency, b.value), 0), balance: totalUsd },
    ...buckets.map((b) => ({ name: b.name, currency: b.currency, earned: earnedOf(b.currency, b.value), balance: b.valueUsd })),
  ];
  const index = Math.min(i, views.length - 1);
  const v = views[index] ?? views[0]!;

  if (loading) {
    return <div className="py-[30px] text-center text-sm text-muted">Loading…</div>;
  }

  // Nothing deposited and nothing earned → onboarding, not a dead "$0.00 earned".
  if (buckets.length === 0 && v.earned === 0) {
    return (
      <div>
        <div className="py-[30px] text-center">
          <div className="text-[15px] font-medium text-muted">Start earning</div>
          <div className="mx-auto mt-2 max-w-[260px] text-[26px] font-semibold leading-tight tracking-[-.01em]">
            Deposit to start earning
          </div>
          <div className="mt-3 text-[13.5px] text-muted">The agent finds the safest yield · no lockup</div>
        </div>
        <Button onClick={() => nav.forward("/add-funds")}>Deposit</Button>
      </div>
    );
  }

  return (
    <div>
      <div className="py-[30px] text-center">
        <div className="text-[15px] font-medium text-muted">Total earned</div>
        <div className="mt-2 text-[54px] font-semibold leading-none tracking-[-.02em] [font-variant-numeric:tabular-nums]">
          {usd(v.earned)}
        </div>
        <div className="mt-3 text-[13.5px] text-muted [font-variant-numeric:tabular-nums]">
          on {usd(v.balance)} balance · no lockup
        </div>
        <BucketToggle views={views} index={index} onCycle={() => setI((n) => (n + 1) % views.length)} />
      </div>
      <div className="flex gap-3">
        <Button onClick={() => nav.forward("/add-funds")}>Deposit</Button>
        <Button variant="glass" onClick={() => nav.forward("/withdraw")}>Move to wallet</Button>
      </div>
    </div>
  );
}
