"use client";
import { useState } from "react";
import { Card, SubHeader } from "../../../../components/ui";
import { ActivityList } from "../../../../components/activity/ActivityList";
import { ExitApproval } from "../../../../components/proposal/ExitApproval";
import { useActivity } from "../../../../hooks/useActivity";
import { usePendingExit } from "../../../../hooks/usePendingExit";

const FILTERS = [{ key: "all", label: "All" }, { key: "you", label: "Yours" }, { key: "auto", label: "Agent" }] as const;
const EMPTY_COPY = {
  all: {
    title: "No activity yet",
    description: "Deposit first; your actions and automated updates will show here.",
  },
  you: {
    title: "No account activity yet",
    description: "Deposits and withdrawals will show here.",
  },
  auto: {
    title: "No agent activity yet",
    description: "Deposit first; automated moves will show here.",
  },
} as const;

export default function ActivityPage() {
  const { loading, items } = useActivity();
  const pend = usePendingExit();
  const [filter, setFilter] = useState<"all" | "you" | "auto">("all");
  const [exitOpen, setExitOpen] = useState(false);
  const shown = filter === "all" ? items : items.filter((a) => a.cat === filter);
  const empty = EMPTY_COPY[filter];
  // Once the exit is approved (no pending exit), the "Review" affordance becomes a dead "Reviewed".
  const reviewed = !pend;
  return (
    <div className="pb-8">
      <div className="stagger">
        <SubHeader title="Activity" />
        <div className="mb-3.5 flex gap-1.5">
          {FILTERS.map((f) => (
            <button key={f.key} aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}
              className={`h-9 flex-1 rounded-full text-[13.5px] font-medium transition-colors ${filter === f.key ? "bg-[#ECECEC] text-pill-ink" : "text-[#8a8a8a] hover:text-ink"}`}>{f.label}</button>
          ))}
        </div>
        <Card className="px-5 py-1">
          <ActivityList
            items={shown}
            loading={loading}
            onReview={() => setExitOpen(true)}
            reviewed={reviewed}
            emptyTitle={empty.title}
            emptyDescription={empty.description}
          />
        </Card>
      </div>

      <ExitApproval open={exitOpen} onClose={() => setExitOpen(false)} />
    </div>
  );
}
