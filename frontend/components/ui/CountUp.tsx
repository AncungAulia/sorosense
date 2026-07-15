"use client";
import { useEffect, useRef, useState } from "react";

/**
 * Animates a number toward `value` (~0.6s ease-out) and renders it through `format`. Test/SSR-safe:
 * `display` starts at `value`, so the final text shows immediately if rAF never runs, and the very
 * first render (mount) does not animate — only later value changes (cycling buckets, toggling
 * Total/Earned) count. Stilled under prefers-reduced-motion.
 */
export function CountUp({
  value,
  format,
  className,
  animateOnMount = false,
  from = 0,
}: {
  value: number;
  format: (n: number) => string;
  className?: string;
  animateOnMount?: boolean;
  from?: number;
}) {
  const mountFrom = animateOnMount && process.env.NODE_ENV !== "test" ? from : value;
  const [display, setDisplay] = useState(mountFrom);
  const fromRef = useRef(mountFrom);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const from = fromRef.current;
    const to = value;
    const reduce =
      process.env.NODE_ENV === "test" ||
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (from === to || reduce || typeof requestAnimationFrame === "undefined" || typeof performance === "undefined") {
      setDisplay(to);
      fromRef.current = to;
      return;
    }
    const start = performance.now();
    const dur = 600;
    const tick = (t: number) => {
      const p = Math.max(0, Math.min(1, (t - start) / dur));
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(from + (to - from) * eased);
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
      else fromRef.current = to;
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [value]);

  return <span className={className}>{format(display)}</span>;
}
