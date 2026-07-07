"use client";
import { Button } from "../../../components/ui";
import { useBuckets } from "../../../hooks/useBuckets";
import { useNav } from "../../../hooks/useNav";

export default function EarnPage() {
  const nav = useNav();
  const { buckets, totalUsd } = useBuckets();

  // Value-weighted blended APY across funded buckets — the "flow" metric this
  // screen headlines (Home headlines the total value "stock"). The full earnings
  // view ("You're earning $X" = value − contributions, + growth chart) lands in U16.
  const weight = buckets.reduce((s, b) => s + b.valueUsd, 0);
  const blendedApy = weight ? buckets.reduce((s, b) => s + b.valueUsd * b.apy, 0) / weight : 0;
  const balance = `$${totalUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div>
      <div className="py-[30px] text-center">
        <div className="text-[15px] font-medium text-muted">You&apos;re earning</div>
        <div className="mt-2 leading-none tracking-[-.02em] [font-variant-numeric:tabular-nums]">
          <span className="text-[54px] font-semibold text-pos">{blendedApy.toFixed(2)}%</span>
          <span className="ml-1.5 text-[22px] font-semibold text-muted">APY</span>
        </div>
        <div className="mt-3 text-[13.5px] text-muted [font-variant-numeric:tabular-nums]">on {balance} balance · no lockup</div>
      </div>
      <div className="flex gap-3">
        <Button onClick={() => nav.forward("/add-funds")}>Deposit</Button>
        <Button variant="glass" onClick={() => nav.forward("/withdraw")}>Move to wallet</Button>
      </div>
    </div>
  );
}
