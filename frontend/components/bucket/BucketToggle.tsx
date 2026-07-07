"use client";
import type { Currency } from "@sorosense/vault-client";
import { CoinBadge } from "../ui";

export interface ToggleView {
  /** Display name, e.g. "All buckets" or "USD bucket". */
  name: string;
  /** The bucket's currency; omitted for the "All buckets" aggregate. */
  currency?: Currency;
}

/**
 * The cycle pill shared by Home and Earn heroes. Shows the current view's token
 * logo (or a generic ring for "All buckets") + name, and a chevron only when
 * there's more than one view to cycle through.
 */
export function BucketToggle({
  views,
  index,
  onCycle,
}: {
  views: ToggleView[];
  index: number;
  onCycle: () => void;
}) {
  const v = views[index] ?? views[0];
  if (!v) return null;
  const multi = views.length > 1;

  return (
    <button
      onClick={multi ? onCycle : undefined}
      aria-label="Switch bucket"
      className="mt-4 inline-flex h-10 items-center gap-2 rounded-full border border-white bg-card pl-2 pr-4 text-[15px] font-semibold [box-shadow:0_1px_2px_rgba(17,19,22,.04),0_8px_18px_-10px_rgba(17,19,22,.18)]"
    >
      {v.currency ? (
        <CoinBadge currency={v.currency} size={24} />
      ) : (
        <span className="ml-1.5 h-[15px] w-[15px] rounded-full border-2 border-ink-2" />
      )}
      {v.name}
      {multi && (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 9l4-4 4 4M8 15l4 4 4-4" />
        </svg>
      )}
    </button>
  );
}
