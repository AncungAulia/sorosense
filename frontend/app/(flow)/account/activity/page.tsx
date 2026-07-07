"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Card, SubHeader } from "../../../../components/ui";
import { ActivityList } from "../../../../components/activity/ActivityList";
import { useActivity } from "../../../../hooks/useActivity";

const FILTERS = [{ key: "all", label: "All" }, { key: "you", label: "Yours" }, { key: "auto", label: "Automated" }] as const;

export default function ActivityPage() {
  const router = useRouter();
  const items = useActivity();
  const [filter, setFilter] = useState<"all" | "you" | "auto">("all");
  const shown = filter === "all" ? items : items.filter((a) => a.cat === filter);
  return (
    <div>
      <SubHeader title="Activity" />
      <div className="mb-3.5 flex gap-1.5">
        {FILTERS.map((f) => (
          <button key={f.key} aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}
            className={`h-9 flex-1 rounded-full text-[13.5px] font-medium ${filter === f.key ? "bg-pill text-pill-ink" : "text-[#8a8a8a]"}`}>{f.label}</button>
        ))}
      </div>
      <Card className="px-5 py-1">
        <ActivityList items={shown} onReview={() => router.push("/account/activity")} />
      </Card>
    </div>
  );
}
