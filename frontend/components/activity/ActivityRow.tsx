import type { ActivityItem } from "../../lib/vault/data";

export function ActivityRow({ item, first, onReview }: { item: ActivityItem; first: boolean; onReview?: () => void }) {
  return (
    <div className={`flex items-center gap-[13px] py-3.5 ${first ? "" : "border-t border-line"}`}>
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-pill text-pill-ink">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-semibold">{item.detail}</div>
        <div className="text-xs text-muted">{item.when}</div>
      </div>
      {item.review && onReview ? (
        <button onClick={onReview} className="h-[30px] shrink-0 rounded-full bg-[#1a1a1a] px-3.5 text-[12.5px] font-semibold text-[#f8f8f8]">Review</button>
      ) : null}
    </div>
  );
}
