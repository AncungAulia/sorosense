"use client";

/**
 * Organic green area chart for the desktop Overview hero — value over time. Pure and deterministic:
 * the caller passes the series (`data`), so there is no randomness or clock read here (SSR-safe).
 * Decorative — `aria-hidden`; the headline number carries the accessible value. Adapted from the
 * mock's `drawChart`/`smooth` (docs/mockups/sorosense-mock-2-desktop.html L583–615).
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

export function ValueChart({ data }: { data: number[] }) {
  const W = 600;
  const H = 210;
  const padT = 14;
  const padB = 10;
  const padL = 4;
  const padR = 4;

  if (data.length < 2) {
    return <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden className="absolute inset-0 block h-full w-full overflow-visible" />;
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const xAt = (i: number) => padL + (i / (data.length - 1)) * (W - padL - padR);
  const yAt = (v: number) => padT + (1 - (v - min) / span) * (H - padT - padB);
  const pts: Pt[] = data.map((v, i) => ({ x: xAt(i), y: yAt(v) }));

  const line = smooth(pts);
  const firstPt = pts[0]!;
  const lastPt = pts[pts.length - 1]!;
  const area = `${line} L ${lastPt.x.toFixed(1)} ${H} L ${firstPt.x.toFixed(1)} ${H} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden className="absolute inset-0 block h-full w-full overflow-visible">
      <defs>
        <linearGradient id="valArea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#16a34a" stopOpacity="0.16" />
          <stop offset="1" stopColor="#16a34a" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path fill="url(#valArea)" stroke="none" d={area} />
      <path fill="none" stroke="#16a34a" strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" d={line} />
      <circle cx={lastPt.x.toFixed(1)} cy={lastPt.y.toFixed(1)} r={4.5} fill="#16a34a" stroke="#fff" strokeWidth={2.5} />
    </svg>
  );
}
