"use client";
import { useState } from "react";
import { formatCurrency } from "../../lib/vault/units";
import type { BucketView } from "../../hooks/useBuckets";
import { BucketToggle } from "../bucket/BucketToggle";

export function TotalHero({ buckets, totalUsd }: { buckets: BucketView[]; totalUsd: number }) {
  const views = [
    {
      label: "Total value",
      name: "All buckets",
      currency: undefined,
      text: `$${totalUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    },
    ...buckets.map((b) => ({
      label: b.name,
      name: b.name,
      currency: b.currency,
      text: formatCurrency(b.value, b.currency),
    })),
  ];
  const [i, setI] = useState(0);
  const index = Math.min(i, views.length - 1);
  const v = views[index] ?? views[0]!;

  return (
    <div className="py-[30px] text-center">
      <div className="text-[15px] font-medium text-muted">{v.label}</div>
      <div className="mt-2 text-[54px] font-semibold leading-none tracking-[-.02em] [font-variant-numeric:tabular-nums]">{v.text}</div>
      <BucketToggle views={views} index={index} onCycle={() => setI((n) => (n + 1) % views.length)} />
    </div>
  );
}
