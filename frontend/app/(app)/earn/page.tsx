"use client";
import { useRouter } from "next/navigation";
import { Button } from "../../../components/ui";
import { useBuckets } from "../../../hooks/useBuckets";

export default function EarnPage() {
  const router = useRouter();
  const { totalUsd } = useBuckets();
  return (
    <div>
      <div className="py-4 text-center">
        <div className="text-[15px] font-medium text-muted">You&apos;re earning</div>
        <div className="mt-2 text-[54px] font-semibold leading-none tracking-[-.02em] [font-variant-numeric:tabular-nums]">
          ${totalUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
      </div>
      <div className="flex gap-3">
        <Button onClick={() => router.push("/add-funds")}>Deposit</Button>
        <Button variant="glass" onClick={() => router.push("/withdraw")}>Move to wallet</Button>
      </div>
    </div>
  );
}
