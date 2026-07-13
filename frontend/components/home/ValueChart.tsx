"use client";
import { useEffect, useRef, useState, type MouseEvent } from "react";

/**
 * Organic green area chart for the desktop Overview hero — value over time. Interactive: hovering
 * shows a crosshair + a dot riding the smoothed curve + a value tooltip (the technique — measure the
 * real width, then `getPointAtLength` binary-search for y at the cursor's x — is lifted from Tends'
 * PortfolioChart). Deterministic input (`data` is passed in), so no randomness/clock read. The path
 * ref is read only inside the mousemove handler (never during render) and `ResizeObserver`/SVG length
 * methods are guarded for jsdom, which lacks them. Adapted from the mock's drawChart/smooth.
 */
type Pt = { x: number; y: number };

/** Catmull-Rom-ish smoothing → a soft cubic-bezier path. Index-safe under noUncheckedIndexedAccess. */
function smooth(p: Pt[]): string {
  const first = p[0];
  if (!first) return "";
  let d = `M ${first.x} ${first.y}`;
  for (let i = 0; i < p.length - 1; i++) {
    const p1 = p[i]!;
    const p2 = p[i + 1]!;
    const p0 = p[i - 1] ?? p1;
    const p3 = p[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

const money = (v: number) => `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function ValueChart({ data }: { data: number[] }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<SVGPathElement>(null);
  const [size, setSize] = useState({ w: 600, h: 210 });
  const [hover, setHover] = useState<{ x: number; y: number; value: number } | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return; // jsdom has no ResizeObserver
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r) setSize({ w: Math.max(1, r.width), h: Math.max(1, r.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { w, h } = size;
  const padT = 14;
  const padB = 10;
  const padL = 4;
  const padR = 4;

  if (data.length < 2) {
    return <div ref={wrapRef} className="absolute inset-0" />;
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const xAt = (i: number) => padL + (i / (data.length - 1)) * (w - padL - padR);
  const yAt = (v: number) => padT + (1 - (v - min) / span) * (h - padT - padB);
  const pts: Pt[] = data.map((v, i) => ({ x: xAt(i), y: yAt(v) }));
  const line = smooth(pts);
  const first = pts[0]!;
  const last = pts[pts.length - 1]!;
  const area = `${line} L ${last.x.toFixed(1)} ${h} L ${first.x.toFixed(1)} ${h} Z`;

  // Ref is read here (an event handler), never during render — satisfies react-hooks/no-ref-in-render.
  const onMove = (e: MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.max(first.x, Math.min(last.x, e.clientX - rect.left));
    const frac = Math.max(0, Math.min(1, (x - padL) / (w - padL - padR)));
    const pos = frac * (data.length - 1);
    const i0 = Math.floor(pos);
    const i1 = Math.min(data.length - 1, i0 + 1);
    const v0 = data[i0] ?? 0;
    const v1 = data[i1] ?? v0;

    const path = lineRef.current;
    let y = pts[Math.round(pos)]?.y ?? 0;
    if (path && typeof path.getTotalLength === "function") {
      const len = path.getTotalLength();
      let lo = 0;
      let hi = len;
      for (let k = 0; k < 18; k++) {
        const mid = (lo + hi) / 2;
        if (path.getPointAtLength(mid).x < x) lo = mid;
        else hi = mid;
      }
      y = path.getPointAtLength((lo + hi) / 2).y;
    }
    setHover({ x, y, value: v0 + (v1 - v0) * (pos - i0) });
  };

  return (
    <div ref={wrapRef} className="absolute inset-0">
      <svg
        width={w}
        height={h}
        aria-hidden
        className="block overflow-visible"
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="valArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#16a34a" stopOpacity="0.16" />
            <stop offset="1" stopColor="#16a34a" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path fill="url(#valArea)" stroke="none" d={area} />
        <path ref={lineRef} fill="none" stroke="#16a34a" strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" d={line} />
        {hover && (
          <>
            <line x1={hover.x} y1={padT} x2={hover.x} y2={h - padB} stroke="rgba(17,19,22,.2)" strokeWidth={1} strokeDasharray="3 3" />
            <circle cx={hover.x} cy={hover.y} r={4.5} fill="#16a34a" stroke="#fff" strokeWidth={2.5} />
          </>
        )}
        <circle cx={last.x.toFixed(1)} cy={last.y.toFixed(1)} r={4.5} fill="#16a34a" stroke="#fff" strokeWidth={2.5} />
      </svg>
      {hover && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-[135%] whitespace-nowrap rounded-[11px] border border-line bg-white px-[11px] py-[5px] text-sm font-semibold [font-variant-numeric:tabular-nums] [box-shadow:0_1px_2px_rgba(17,19,22,.04),0_8px_18px_-10px_rgba(17,19,22,.18)]"
          style={{ left: Math.max(48, Math.min(w - 48, hover.x)), top: hover.y }}
        >
          {money(hover.value)}
        </div>
      )}
    </div>
  );
}
