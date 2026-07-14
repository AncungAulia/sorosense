import type { CSSProperties } from "react";

/**
 * A loading placeholder block: a light shimmer sweeps across a soft-grey shape. Sizing/shape comes
 * from the caller's className/style (mirror the real element it stands in for) — the `.skeleton` base
 * (globals.css) owns the tone + the sweep, and stills under prefers-reduced-motion.
 */
export function Skeleton({ className = "", style }: { className?: string; style?: CSSProperties }) {
  return <div data-testid="skeleton" aria-hidden style={style} className={`skeleton ${className}`} />;
}
