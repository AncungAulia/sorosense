"use client";

import { useEffect, useRef, useState, type ReactNode, type CSSProperties } from "react";

const RED = "#F23A1C";
const PAPER: RGB = [239, 239, 237];
const CHARCOAL: RGB = [28, 23, 20]; // warm charcoal — not pure black
const CHARCOAL_CSS = `rgb(${CHARCOAL.join(",")})`;
const INK: RGB = [11, 11, 12];
const WHITE: RGB = [255, 255, 255];
const BLUR_STEP = 1.5; // px of blur a card gains per newer one that pops

type RGB = [number, number, number];
const clamp = (v: number, a: number, b: number) => Math.min(Math.max(v, a), b);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const mix = (a: RGB, b: RGB, t: number) =>
  `rgb(${Math.round(lerp(a[0], b[0], t))},${Math.round(lerp(a[1], b[1], t))},${Math.round(lerp(a[2], b[2], t))})`;

type Notif = {
  app?: string;
  icon?: string;
  iconBg?: string;
  msg?: ReactNode;
  time?: string;
  pos: CSSProperties;
  w: string;
  t: number; // scroll progress at which it pops
  centered?: boolean;
  climax?: boolean;
  abstract?: boolean; // an empty glass pad — pure noise, no content
  h?: string;
};

// The flood of DeFi dread; empty pads add abstract depth, and the centred card
// is our problem — it pops last, so it ends up the only sharp one.
const NOTIFS: Notif[] = [
  { abstract: true, pos: { top: "13%", left: "25%" }, w: "210px", h: "66px", t: 0.22 },
  { abstract: true, pos: { bottom: "19%", right: "26%" }, w: "250px", h: "58px", t: 0.26 },
  { abstract: true, pos: { top: "58%", left: "35%" }, w: "175px", h: "54px", t: 0.3 },
  { app: "Price Alert", icon: "📉", iconBg: "#e8483a", msg: "USTRY pumped from $1 to $107 in one trade", time: "now", pos: { top: "1%", left: "0%" }, w: "345px", t: 0.3 },
  { app: "Loan", icon: "💸", iconBg: "#2f6df0", msg: "$10M borrowed against worthless collateral", time: "2m", pos: { top: "0%", right: "0%" }, w: "410px", t: 0.35 },
  { app: "Pool", icon: "🕳️", iconBg: "#7c3aed", msg: "The lending pool was drained dry", time: "1m", pos: { top: "18%", right: "20%" }, w: "270px", t: 0.4 },
  { app: "DeFi Watch", icon: "🔔", iconBg: "#f0932f", msg: "A single $5 trade broke the price feed", time: "6m", pos: { top: "42%", left: "0%" }, w: "335px", t: 0.45 },
  { app: "Reflector", icon: "📡", iconBg: "#0891b2", msg: "Fed the pool a faked price", time: "8m", pos: { top: "61%", right: "3%" }, w: "265px", t: 0.5 },
  { app: "Bridge", icon: "🌉", iconBg: "#16a34a", msg: "The funds moved to Ethereum in minutes", time: "4m", pos: { bottom: "25%", left: "2%" }, w: "360px", t: 0.55 },
  { app: "Market", icon: "📊", iconBg: "#c9a227", msg: "USTRY: under $1 an hour in volume", time: "9m", pos: { bottom: "8%", right: "1%" }, w: "285px", t: 0.6 },
  { app: "News", icon: "📰", iconBg: "#5a5a5f", msg: "Depositors woke to a drained pool", time: "12m", pos: { bottom: "3%", left: "16%" }, w: "395px", t: 0.66 },
  {
    app: "Breaking",
    icon: "🚨",
    iconBg: RED,
    msg: (
      <>
        YieldBlox drained. <span style={{ color: RED }}>$10.8M</span> gone in a single night.
      </>
    ),
    time: "now",
    pos: { top: "37%", left: "50%" },
    w: "430px",
    t: 0.82,
    centered: true,
    climax: true,
  },
];

const STORY_LINES = [
  "This is what yield without a guard looks like.",
  "Millions gone before the morning, and it will not be the last.",
];

function NotifCard({ n }: { n: Notif }) {
  if (n.abstract) {
    return (
      <div
        className="rounded-2xl border border-white/[0.06] bg-white/[0.035] backdrop-blur-xl"
        style={{ height: n.h }}
      />
    );
  }
  return (
    <div
      className="rounded-2xl border border-white/10 bg-white/[0.07] p-3.5 backdrop-blur-xl"
      style={n.climax ? { boxShadow: `0 0 0 1px ${RED}66, 0 10px 34px rgba(0,0,0,.5)` } : undefined}
    >
      <div className="flex items-center gap-2.5">
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-base" style={{ backgroundColor: n.iconBg }}>
          {n.icon}
        </div>
        <span className="text-sm font-semibold text-white">{n.app}</span>
        <span className="ml-auto text-xs text-white/40">{n.time}</span>
      </div>
      <p className={`mt-1.5 text-left text-[15px] ${n.climax ? "text-white" : "text-white/70"}`}>{n.msg}</p>
    </div>
  );
}

/* Premium Apple-style reconstruction: a smooth line + gradient area fill (no
   dots), drawn in on scroll with a glowing tip. The finished chart is plain —
   only the reveal glows. */
function ChartReconstruction() {
  const chartRef = useRef<HTMLDivElement>(null);
  const storyRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<SVGPathElement>(null);
  const areaRef = useRef<SVGPathElement>(null);
  const glowRef = useRef<SVGGElement>(null);
  const annRef = useRef<SVGGElement>(null);
  const [storyActive, setStoryActive] = useState(false);

  useEffect(() => {
    const line = lineRef.current;
    if (line) {
      const len = line.getTotalLength();
      line.style.strokeDasharray = `${len}`;
      line.style.strokeDashoffset = `${len}`;
    }
    if (areaRef.current) areaRef.current.style.opacity = "0";
    if (glowRef.current) glowRef.current.style.opacity = "0";
    if (annRef.current) annRef.current.style.opacity = "0";
  }, []);

  // The story reveals on view (reversible via CSS transition).
  useEffect(() => {
    const story = storyRef.current;
    if (!story) return;
    const io = new IntersectionObserver(([e]) => setStoryActive(e.isIntersecting), { threshold: 0.5 });
    io.observe(story);
    return () => io.disconnect();
  }, []);

  // The chart draw is tied to scroll position, so it draws / un-draws exactly as
  // fast as you scroll — staying in step with the heavy (slow) scroll. The tip
  // glows wherever the line currently ends.
  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const chart = chartRef.current;
        const line = lineRef.current;
        if (!chart || !line) return;
        const vh = window.innerHeight || 1;
        const top = chart.getBoundingClientRect().top;
        const p = clamp((vh * 0.9 - top) / (vh * 0.55), 0, 1);
        const len = line.getTotalLength();
        line.style.strokeDashoffset = `${len * (1 - p)}`;
        if (areaRef.current) areaRef.current.style.opacity = `${p}`;
        if (annRef.current) annRef.current.style.opacity = `${clamp((p - 0.7) / 0.3, 0, 1)}`;
        const glow = glowRef.current;
        if (glow) {
          const pt = line.getPointAtLength(p * len);
          glow.setAttribute("transform", `translate(${pt.x},${pt.y})`);
          glow.style.opacity = p > 0.01 && p < 0.99 ? "1" : "0";
        }
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <section
      className="flex min-h-screen flex-col items-center px-6 pb-[16vh] pt-[9vh]"
      style={{ backgroundColor: CHARCOAL_CSS }}
    >
      <p className="font-display text-2xl font-normal tracking-tight text-white/50 md:text-3xl">How it happened</p>

      <div ref={chartRef} className="mt-[13vh] w-full max-w-6xl">
        <svg viewBox="0 0 1000 400" className="w-full" fill="none">
          <defs>
            <linearGradient id="riskFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={RED} stopOpacity="0.3" />
              <stop offset="1" stopColor={RED} stopOpacity="0" />
            </linearGradient>
            <filter id="tipGlow" x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur stdDeviation="8" />
            </filter>
          </defs>

          <path ref={areaRef} d="M0,312 C150,308 320,314 560,310 L650,44 L700,300 L742,376 L1000,376 L1000,400 L0,400 Z" fill="url(#riskFill)" />
          <path
            ref={lineRef}
            d="M0,312 C150,308 320,314 560,310 L650,44 L700,300 L742,376 L1000,376"
            stroke={RED}
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* glowing pen-tip — only visible while drawing */}
          <g ref={glowRef} style={{ opacity: 0 }}>
            <circle r="10" fill={RED} filter="url(#tipGlow)" />
            <circle r="3" fill="#fff2ee" />
          </g>

          {/* annotations narrate the mechanism (Plus Jakarta Sans, no dots) */}
          <g ref={annRef} style={{ opacity: 0, fontFamily: "var(--font-jakarta)" }}>
            <text x="40" y="292" fontSize="15" fill="rgba(255,255,255,0.5)">$1, dead market</text>
            <text x="560" y="340" fontSize="15" fill="rgba(255,255,255,0.6)">one $5 trade</text>
            <text x="666" y="40" fontSize="16" fill={RED}>$107 faked</text>
            <text x="756" y="352" fontSize="15" fill="rgba(255,255,255,0.6)">$10.8M drained</text>
          </g>
        </svg>

        <p className="mt-6 text-center text-xs text-white/35">
          Reconstructed from the February 2026 YieldBlox incident. Sources:{" "}
          <a
            href="https://rekt.news/yieldblox-rekt"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 transition hover:text-white/70"
          >
            Rekt
          </a>
          ,{" "}
          <a
            href="https://blocksec.com/blog/yieldblox-dao-incident-on-stellar-oracle-misconfiguration-enabled-a-10m-drain"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 transition hover:text-white/70"
          >
            BlockSec
          </a>
          .
        </p>
      </div>

      {/* the reflective punch — same gap as the eyebrow, reveals line by line */}
      <div ref={storyRef} className="mt-[13vh] max-w-2xl text-center text-xl leading-relaxed text-white/75 md:text-2xl">
        {STORY_LINES.map((line, i) => (
          <p key={i} className={`story-line ${storyActive ? "in" : ""}`} style={{ transitionDelay: `${i * 0.14}s` }}>
            {line}
          </p>
        ))}
      </div>
    </section>
  );
}

export function RiskSection() {
  const pinRef = useRef<HTMLElement>(null);
  const [p, setP] = useState(0);

  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const el = pinRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const denom = el.offsetHeight - window.innerHeight;
        setP(denom > 0 ? clamp(-rect.top / denom, 0, 1) : 0);
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  const night = clamp(p / 0.2, 0, 1); // grey -> charcoal, starts the moment it pins

  return (
    <>
      <style>{`
        .story-line{opacity:0;transform:translateY(1.1em);filter:blur(10px);transition:opacity .8s ease,transform .8s cubic-bezier(.22,.61,.25,1),filter .8s ease}
        .story-line.in{opacity:1;transform:none;filter:blur(0)}
      `}</style>

      {/* pinned: grey -> night, then the notifications pile up */}
      <section ref={pinRef} className="relative" style={{ height: "180vh" }}>
        <div
          className="sticky top-0 flex h-screen flex-col overflow-hidden px-6 pb-20 pt-28"
          style={{ backgroundColor: mix(PAPER, CHARCOAL, night) }}
        >
          <h2
            className="text-center font-display text-[clamp(2.75rem,7vw,4.75rem)] font-normal leading-none tracking-tight"
            style={{ color: mix(INK, WHITE, night), transform: `translateY(${lerp(30, 0, night)}vh)` }}
          >
            The Risk
          </h2>

          <div className="relative mx-auto mt-10 w-full max-w-5xl flex-1" style={{ opacity: night }}>
            {NOTIFS.map((n, i) => {
              const shown = p > n.t;
              const base = n.centered ? "translate(-50%,-50%) " : "";
              const newerPopped = NOTIFS.filter((m, j) => j > i && p > m.t).length;
              return (
                <div key={i} className="absolute" style={{ ...n.pos, width: n.w, zIndex: n.climax ? 20 : n.abstract ? 5 : 10 }}>
                  <div
                    style={{
                      transformOrigin: "center",
                      transform: `${base}scale(${shown ? 1 : 0.6})`,
                      opacity: shown ? 1 : 0,
                      filter: `blur(${newerPopped * BLUR_STEP}px)`,
                      transition:
                        "transform .55s cubic-bezier(.34,1.56,.64,1), opacity .4s ease, filter .4s ease",
                    }}
                  >
                    <NotifCard n={n} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* the reconstruction (chart) + the reflective punch */}
      <ChartReconstruction />
    </>
  );
}
