"use client";
import { useState } from "react";
import { Drawer } from "../ui/Drawer";
import { Segmented } from "../ui";
import { ActivityList } from "../activity/ActivityList";
import { useActivity } from "../../hooks/useActivity";
import { usePendingExit } from "../../hooks/usePendingExit";

const TABS = ["All", "Yours", "Agent"] as const;
type Tab = (typeof TABS)[number];
/** Tab → the ActivityItem.cat it filters to (All is the UI-only sentinel). */
const TAB_CAT: Record<Tab, "you" | "auto" | null> = { All: null, Yours: "you", Agent: "auto" };
const EMPTY_COPY: Record<Tab, { title: string; description: string }> = {
  All: {
    title: "No activity yet",
    description: "Deposit first; your actions and automated updates will show here.",
  },
  Yours: {
    title: "No account activity yet",
    description: "Deposits and withdrawals will show here.",
  },
  Agent: {
    title: "No agent activity yet",
    description: "Deposit first; automated moves will show here.",
  },
};

/**
 * Desktop activity drawer: mirrors the mobile Activity page (interface-map §8) but the hand-rolled
 * tab buttons become the shared flat `Segmented` (variant="period"). ActivityList is reused AS-IS —
 * the `kind`→icon enhancement is deferred (pending Axel's reply on STE-48). Review → onReview (the
 * panel host opens the safe-exit dialog).
 */
export function ActivityDrawer({ open, onClose, onReview }: { open: boolean; onClose: () => void; onReview: () => void }) {
  const { loading, items } = useActivity();
  const pend = usePendingExit();
  const [tab, setTab] = useState<Tab>("All");
  const cat = TAB_CAT[tab];
  const shown = cat === null ? items : items.filter((a) => a.cat === cat);
  const empty = EMPTY_COPY[tab];
  return (
    <Drawer open={open} onClose={onClose} label="Activity">
      <div className="flex items-center justify-between border-b border-line px-[22px] pb-3.5 pt-5">
        <span className="text-[17px] font-semibold">Activity</span>
        <button aria-label="Close" onClick={onClose} className="grid h-[34px] w-[34px] place-items-center rounded-full bg-pill text-ink-2">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </div>
      <div className="flex-1 overflow-auto px-[22px] py-5">
        <Segmented options={TABS} value={tab} onChange={setTab} label="Filter" variant="period" />
        <div className="mt-2">
          <ActivityList
            items={shown}
            loading={loading}
            onReview={onReview}
            reviewed={!pend}
            divider={false}
            emptyTitle={empty.title}
            emptyDescription={empty.description}
          />
        </div>
      </div>
    </Drawer>
  );
}
