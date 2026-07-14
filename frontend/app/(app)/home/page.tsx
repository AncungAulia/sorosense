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

function MobileHome() {
  const nav = useNav();
  const { loading, buckets, totalUsd } = useBuckets();
  const { loading: activityLoading, items: activity } = useActivity();
  const pend = usePendingExit();
  const [exitOpen, setExitOpen] = useState(false);

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
      <Button className="mb-[22px]" onClick={() => nav.forward("/add-funds")}>Add funds</Button>

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
          <div className="py-6 text-center text-sm text-muted">No buckets yet. Add funds to start.</div>
        ) : (
          <div className="fade-in">{buckets.map((b, i) => <BucketRow key={b.currency} bucket={b} first={i === 0} />)}</div>
        )}
      </Card>

      <h2 className="mx-1 mb-2 text-sm font-medium text-muted">Agent</h2>
      <Card className="px-5 pb-2 pt-1">
        <ActivityList items={activity.slice(0, 3)} loading={activityLoading} onReview={() => setExitOpen(true)} reviewed={!pend} />
        <button onClick={() => nav.forward("/account/activity")}
          className="mt-1.5 flex w-full items-center justify-center gap-[3px] border-t border-line pt-[13px] pb-[3px] text-[13.5px] font-medium text-muted">
          View all activity
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
        </button>
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
