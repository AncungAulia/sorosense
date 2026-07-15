"use client";
import { useState } from "react";
import { Button, Card, Skeleton } from "../../../components/ui";
import { useNav } from "../../../hooks/useNav";
import { TotalHero } from "../../../components/home/TotalHero";
import { FreezeBanner } from "../../../components/status/FreezeBanner";
import { BucketRow } from "../../../components/bucket/BucketRow";
import { ActivityList } from "../../../components/activity/ActivityList";
import { ExitApproval } from "../../../components/proposal/ExitApproval";
import { useBuckets } from "../../../hooks/useBuckets";
import { useActivity } from "../../../hooks/useActivity";
import { usePendingExit } from "../../../hooks/usePendingExit";
import { useIsDesktop } from "../../../hooks/useIsDesktop";
import { DesktopOverview } from "../../../components/home/DesktopOverview";

function CoinStackIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="text-ink-2" aria-hidden="true">
      <ellipse cx="12" cy="6" rx="7" ry="3" />
      <path d="M5 6v5c0 1.7 3.1 3 7 3s7-1.3 7-3V6" />
      <path d="M5 11v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5" />
    </svg>
  );
}

function EmptyBucketsMobile() {
  return (
    <div className="flex flex-col items-center px-5 py-7 text-center">
      <div className="grid h-11 w-11 place-items-center rounded-full border border-line bg-white [box-shadow:0_1px_2px_rgba(17,19,22,.04),0_10px_22px_-16px_rgba(17,19,22,.2)]">
        <CoinStackIcon />
      </div>
      <p className="mt-3 text-[13.5px] font-semibold text-ink">No deposits yet</p>
      <p className="mt-1 max-w-[230px] text-[12.5px] leading-snug text-muted">Deposit your money to create your first earning bucket.</p>
    </div>
  );
}

function MobileHome() {
  const nav = useNav();
  const { loading, buckets, totalUsd } = useBuckets();
  const { loading: activityLoading, items: activity } = useActivity();
  const pend = usePendingExit();
  const [exitOpen, setExitOpen] = useState(false);
  const agentActivity = buckets.length === 0 ? [] : activity.filter((item) => item.cat === "auto");
  const agentPreview = agentActivity.slice(0, 3);
  const hasMoreAgentActivity = agentActivity.length > 3;

  return (
    <div>
      <div className="stagger">
      {loading ? (
        <div className="py-[30px] text-center">
          <Skeleton className="mx-auto h-4 w-28" />
          <Skeleton className="mx-auto mt-3 h-[46px] w-[210px] rounded-lg" />
        </div>
      ) : (
        <TotalHero buckets={buckets} totalUsd={totalUsd} />
      )}
      {pend && <FreezeBanner onReview={() => setExitOpen(true)} />}
      <Button className="mb-[22px]" onClick={() => nav.forward("/deposit")}>Deposit</Button>

      <h2 className="mx-1 mb-2 text-sm font-medium text-muted">Buckets</h2>
      <Card className="mb-[22px] px-5 py-1">
        {loading ? (
          <div className="flex flex-col gap-4 py-3">
            {[0, 1].map((i) => (
              <div key={i} className="flex items-center gap-[13px]">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="flex-1">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="mt-2 h-3 w-16" />
                </div>
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
        ) : buckets.length === 0 ? (
          <EmptyBucketsMobile />
        ) : (
          <div className="fade-in">{buckets.map((b, i) => <BucketRow key={b.currency} bucket={b} first={i === 0} />)}</div>
        )}
      </Card>

      <h2 className="mx-1 mb-2 text-sm font-medium text-muted">Agent</h2>
      <Card className="px-5 pb-2 pt-1">
        <ActivityList
          items={agentPreview}
          loading={activityLoading}
          onReview={() => setExitOpen(true)}
          reviewed={!pend}
          emptyTitle="No agent activity yet"
          emptyDescription="Deposit first; automated moves will show here."
        />
        {hasMoreAgentActivity && (
          <button
            onClick={() => nav.forward("/account/activity")}
            className="mt-1.5 flex w-full items-center justify-center border-t border-line pb-[3px] pt-[13px] text-[13.5px] font-medium text-muted"
          >
            View all activity
          </button>
        )}
      </Card>
      </div>

      <ExitApproval open={exitOpen} onClose={() => setExitOpen(false)} />
    </div>
  );
}

export default function HomePage() {
  const isDesktop = useIsDesktop();
  return isDesktop ? <DesktopOverview /> : <MobileHome />;
}
