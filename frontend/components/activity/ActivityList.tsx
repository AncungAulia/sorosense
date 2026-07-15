import { ActivityRow } from "./ActivityRow";
import { Skeleton } from "../ui";
import type { ActivityItem } from "../../lib/vault/data";

export function ActivityList({
  items,
  onReview,
  reviewed,
  divider = true,
  loading = false,
  emptyTitle,
  emptyDescription,
}: {
  items: ActivityItem[];
  onReview?: () => void;
  reviewed?: boolean;
  divider?: boolean;
  loading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
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

  if (items.length === 0 && emptyTitle) {
    return (
      <div className="fade-in flex flex-1 flex-col items-center justify-center px-5 py-7 text-center">
        <div className="grid h-11 w-11 place-items-center rounded-full border border-line bg-white [box-shadow:0_1px_2px_rgba(17,19,22,.04),0_10px_22px_-16px_rgba(17,19,22,.2)]">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="text-ink-2" aria-hidden="true">
            <path d="M12 6v6l4 2" />
            <path d="M20 12a8 8 0 1 1-2.34-5.66" />
            <path d="M20 4v5h-5" />
          </svg>
        </div>
        <p className="mt-3 text-[13.5px] font-semibold text-ink">{emptyTitle}</p>
        {emptyDescription && (
          <p className="mt-1 max-w-[230px] text-[12.5px] leading-snug text-muted">{emptyDescription}</p>
        )}
      </div>
    );
  }

  return (
    <div className={`${wrap} fade-in`}>
      {items.map((item, i) => <ActivityRow key={item.id} item={item} first={i === 0} onReview={onReview} reviewed={reviewed} divider={divider} />)}
    </div>
  );
}
