"use client";

/**
 * Desktop safe-exit nudge (mockup `.freezebar`). Unlike the mobile `FreezeBanner` (the whole card is
 * one tap target), the desktop bar is a static row with a distinct **Review** button on the right —
 * the row itself is not clickable. Copy is invisible-safe ("paused", never "risk"/"Sentinel").
 */
export function FreezeBar({ onReview }: { onReview: () => void }) {
  return (
    <div className="mb-4 flex items-center gap-3 rounded-card border border-white bg-card px-4 py-[13px] [box-shadow:0_1px_2px_rgba(17,19,22,.03),0_14px_34px_-22px_rgba(17,19,22,.16)]">
      <span className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-xl bg-warn-soft text-warn">
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <path d="M12 9v4M12 17h.01" />
        </svg>
      </span>
      <div className="min-w-0 flex-1">
        <div className="font-semibold">Your earning is paused</div>
        <div className="text-[12.5px] text-muted">Review and approve the move</div>
      </div>
      <button
        type="button"
        onClick={onReview}
        aria-label="Review paused pool"
        className="inline-flex h-[30px] shrink-0 items-center rounded-full bg-ink px-3.5 text-[12.5px] font-semibold text-[#f8f8f8] transition-opacity hover:opacity-90"
      >
        Review
      </button>
    </div>
  );
}
