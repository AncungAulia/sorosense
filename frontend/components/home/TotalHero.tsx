"use client";
import { useState } from "react";
import { formatCurrency, UNIT } from "../../lib/vault/units";
import type { BucketView } from "../../hooks/useBuckets";
import { BucketToggle } from "../bucket/BucketToggle";
import { CountUp } from "../ui";

const dec = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function TotalHero({ buckets, totalUsd }: { buckets: BucketView[]; totalUsd: number }) {
  const views = [
    {
      label: "Total value",
      name: "All buckets",
      currency: undefined,
      text: `$${dec(totalUsd)}`,
      valueNum: totalUsd,
      fmt: (n: number) => `$${dec(n)}`,
    },
    ...buckets.map((b) => {
      const sym = b.currency === "EUR" ? "€" : "$";
      // Name the currency bucket ("USD Bucket"), not the venue — a real `/holdings` row's `name` is the
      // pool ("USDC SoroSense Pool"), which is not what the toggle lists. Capital B matches BucketRow.
      const label = `${b.currency} Bucket`;
      return {
        label,
        name: label,
        currency: b.currency,
        text: formatCurrency(b.value, b.currency),
        valueNum: Number(b.value) / Number(UNIT),
        fmt: (n: number) => `${sym}${dec(n)}`,
      };
    }),
  ];
  const [i, setI] = useState(0);
  const index = Math.min(i, views.length - 1);
  const v = views[index] ?? views[0]!;

  return (
    <div className="py-[30px] text-center">
      <div className="text-[15px] font-medium text-muted">{v.label}</div>
      <CountUp animateOnMount value={v.valueNum} format={v.fmt} className="mt-2 block text-[54px] font-semibold leading-none tracking-[-.02em] [font-variant-numeric:tabular-nums]" />
      <BucketToggle views={views} index={index} onCycle={() => setI((n) => (n + 1) % views.length)} />
    </div>
  );
}
