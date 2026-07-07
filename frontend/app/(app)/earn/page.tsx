"use client";
import { Button } from "../../../components/ui";
import { useBuckets } from "../../../hooks/useBuckets";
import { useNav } from "../../../hooks/useNav";

export default function EarnPage() {
  const nav = useNav();
  const { totalUsd } = useBuckets();
  return (
    <div>
      <div className="py-[30px] text-center">
        <div className="text-[15px] font-medium text-muted">Total balance</div>
        <div className="mt-2 text-[54px] font-semibold leading-none tracking-[-.02em] [font-variant-numeric:tabular-nums]">
          ${totalUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
      </div>
      <div className="flex gap-3">
        <Button onClick={() => nav.forward("/add-funds")}>Deposit</Button>
        <Button variant="glass" onClick={() => nav.forward("/withdraw")}>Move to wallet</Button>
      </div>
    </div>
  );
}
