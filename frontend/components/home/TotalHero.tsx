"use client";
import { useState } from "react";
import { formatCurrency } from "../../lib/vault/units";
import type { BucketView } from "../../hooks/useBuckets";

export function TotalHero({ buckets, totalUsd }: { buckets: BucketView[]; totalUsd: number }) {
  const views = [{ label: "Total value", name: "All buckets", text: `$${totalUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
    ...buckets.map((b) => ({ label: b.name, name: b.name, text: formatCurrency(b.value, b.currency) }))];
  const [i, setI] = useState(0);
  const v = views[i] ?? views[0]!;
  return (
    <div className="py-[30px] text-center">
      <div className="text-[15px] font-medium text-muted">{v.label}</div>
      <div className="mt-2 text-[54px] font-semibold leading-none tracking-[-.02em] [font-variant-numeric:tabular-nums]">{v.text}</div>
      <button onClick={() => setI((n) => (n + 1) % views.length)} aria-label="Switch bucket"
        className="mt-4 inline-flex h-10 items-center gap-2.5 rounded-full border border-white bg-card pl-[15px] pr-2.5 text-[15px] font-semibold [box-shadow:0_1px_2px_rgba(17,19,22,.04),0_8px_18px_-10px_rgba(17,19,22,.18)]">
        <span className="h-[15px] w-[15px] rounded-full border-2 border-ink-2" />{v.name}
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M8 9l4-4 4 4M8 15l4 4 4-4" /></svg>
      </button>
    </div>
  );
}
