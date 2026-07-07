"use client";
import { Button, Card } from "../../../components/ui";
import { useNav } from "../../../hooks/useNav";
import { TotalHero } from "../../../components/home/TotalHero";
import { FreezeBanner } from "../../../components/home/FreezeBanner";
import { BucketRow } from "../../../components/bucket/BucketRow";
import { ActivityList } from "../../../components/activity/ActivityList";
import { useBuckets } from "../../../hooks/useBuckets";
import { useActivity } from "../../../hooks/useActivity";

export default function HomePage() {
  const nav = useNav();
  const { loading, buckets, totalUsd } = useBuckets();
  const activity = useActivity();
  const anyFrozen = buckets.some((b) => b.frozen);

  return (
    <div>
      <TotalHero buckets={buckets} totalUsd={totalUsd} />
      {anyFrozen && <FreezeBanner onReview={() => nav.forward("/account/activity")} />}
      <Button className="mb-[22px]" onClick={() => nav.forward("/add-funds")}>Add funds</Button>

      <h2 className="mx-1 mb-2 text-sm font-medium text-muted">Buckets</h2>
      <Card className="mb-[22px] px-5 py-1">
        {loading ? <div className="py-6 text-center text-sm text-muted">Loading…</div>
          : buckets.length === 0 ? <div className="py-6 text-center text-sm text-muted">No buckets yet. Add funds to start.</div>
          : buckets.map((b, i) => <BucketRow key={b.currency} bucket={b} first={i === 0} />)}
      </Card>

      <h2 className="mx-1 mb-2 text-sm font-medium text-muted">Agent activity</h2>
      <Card className="px-5 pb-2 pt-1">
        <ActivityList items={activity.slice(0, 3)} onReview={() => nav.forward("/account/activity")} />
        <button onClick={() => nav.forward("/account/activity")}
          className="mt-1.5 flex w-full items-center justify-center gap-[3px] border-t border-line pt-[13px] pb-[3px] text-[13.5px] font-medium text-muted">
          View all activity
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
        </button>
      </Card>
    </div>
  );
}
