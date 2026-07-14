import { ActivityRow } from "./ActivityRow";
import { Skeleton } from "../ui";
import type { ActivityItem } from "../../lib/vault/data";

export function ActivityList({
  items,
  onReview,
  reviewed,
  divider = true,
  loading = false,
}: {
  items: ActivityItem[];
  onReview?: () => void;
  reviewed?: boolean;
  divider?: boolean;
  loading?: boolean;
}) {
  // Without dividers the rows blend together, so give them a little breathing room instead.
  const wrap = divider ? "" : "flex flex-col gap-1";

  if (loading) {
    return (
      <div className={wrap}>
        {[0, 1, 2].map((i) => (
          <div key={i} className={`flex items-center gap-[13px] py-3.5 ${divider && i !== 0 ? "border-t border-line" : ""}`}>
            <Skeleton className="h-9 w-9 rounded-full" />
            <div className="flex-1">
              <Skeleton className="h-3.5 w-40" />
              <Skeleton className="mt-2 h-3 w-16" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={`${wrap} fade-in`}>
      {items.map((item, i) => <ActivityRow key={item.id} item={item} first={i === 0} onReview={onReview} reviewed={reviewed} divider={divider} />)}
    </div>
  );
}
