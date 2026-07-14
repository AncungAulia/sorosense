import type { CSSProperties } from "react";

/**
 * A loading placeholder block. Sizing/shape comes from the caller's className/style (mirror the real
 * element it stands in for). Pulses to signal "loading", but stays still under prefers-reduced-motion.
 */
export function Skeleton({ className = "", style }: { className?: string; style?: CSSProperties }) {
  return <div data-testid="skeleton" aria-hidden style={style} className={`animate-pulse rounded-md bg-line motion-reduce:animate-none ${className}`} />;
}
