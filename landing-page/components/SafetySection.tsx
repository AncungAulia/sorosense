"use client";

/* Safety / Sentinel — the answer to "The Risk". After the dark YieldBlox story,
   this section is plain white (a hard cut from the Risk charcoal, like
   hero to Earn) and lays out how SoroSense guards the funds, in a Plasma-style
   bento: soft grey cards on white, a small title + description top-left, and a
   big visual zone below (image-ready: the `.sfy-visual` panels are placeholders
   to swap for real renders/photos). Blue (brand) is kept to a single live moment
   (the Sentinel radar); everything else stays monochrome/muted, Plasma-style. */

import { useEffect, useRef, useState } from "react";

function KeyIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="8.5" cy="8.5" r="4.5" />
      <path d="M11.7 11.7 20 20" />
      <path d="m17 17 2-2M15 19l2-2" />
    </svg>
  );
}

function SparkleIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 3c.4 3.6 1.4 4.6 5 5-3.6.4-4.6 1.4-5 5-.4-3.6-1.4-4.6-5-5 3.6-.4 4.6-1.4 5-5Z" />
      <path d="M18.5 14c.2 1.6.7 2.1 2.3 2.3-1.6.2-2.1.7-2.3 2.3-.2-1.6-.7-2.1-2.3-2.3 1.6-.2 2.1-.7 2.3-2.3Z" />
    </svg>
  );
}

function ShieldCheckIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 3 5 6v5c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

/* Image-ready placeholder — a soft panel with a faint emblem. Swap the inner
   content for an <img> / render when the artwork lands. */
function VisualSlot({ icon, className = "" }: { icon: React.ReactNode; className?: string }) {
  return (
    <div className={`sfy-visual flex items-center justify-center rounded-md bg-gradient-to-b from-cloud to-[#e6e6e2] ${className}`}>
      {/* TODO: replace with a Plasma-style image/render */}
      <span className="text-ink/20">{icon}</span>
    </div>
  );
}

export function SafetySection() {
  const ref = useRef<HTMLElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <section ref={ref} className="relative overflow-hidden bg-cloud">
      <style>{`
        .sfy-card { opacity: 0; transform: translateY(18px); transition: opacity .6s ease, transform .6s ease; }
        .sfy-in .sfy-card { opacity: 1; transform: none; }
        .sfy-in .sfy-card:nth-child(1) { transition-delay: .04s; }
        .sfy-in .sfy-card:nth-child(2) { transition-delay: .11s; }
        .sfy-in .sfy-card:nth-child(3) { transition-delay: .18s; }
        .sfy-in .sfy-card:nth-child(4) { transition-delay: .25s; }

        /* Sentinel radar — expanding rings around a steady watch-dot. */
        .sfy-radar { position: relative; width: 140px; height: 140px; }
        .sfy-ring { position: absolute; inset: 0; margin: auto; border-radius: 9999px; border: 1px solid var(--color-brand-ink); opacity: 0; animation: sfy-ping 2.6s ease-out infinite; }
        .sfy-ring:nth-child(2) { animation-delay: .87s; }
        .sfy-ring:nth-child(3) { animation-delay: 1.74s; }
        .sfy-dot { position: absolute; inset: 0; margin: auto; width: 14px; height: 14px; border-radius: 9999px; background: var(--color-brand-ink); box-shadow: 0 0 0 6px rgba(63,92,192,.14); }
        @keyframes sfy-ping { 0% { transform: scale(.2); opacity: .7; } 100% { transform: scale(1); opacity: 0; } }

        .sfy-live { width: 7px; height: 7px; border-radius: 9999px; background: var(--color-brand-ink); animation: sfy-blink 1.8s ease-in-out infinite; }
        @keyframes sfy-blink { 0%, 100% { opacity: 1; } 50% { opacity: .3; } }
      `}</style>

      <div className={`relative mx-auto max-w-6xl px-6 pb-28 pt-28 sm:px-10 md:pb-36 md:pt-36 ${shown ? "sfy-in" : ""}`}>
        {/* header — answers "yield without a guard" */}
        <p className="font-display text-3xl font-normal leading-none tracking-tight text-brand-ink md:text-4xl">Safety</p>
        <h2 className="mt-3 max-w-3xl font-display text-[clamp(2.25rem,4.4vw,4.25rem)] font-normal leading-[1.05] tracking-tight text-ink">
          We keep your funds safe.
        </h2>
        <p className="mt-4 max-w-xl text-base leading-relaxed text-muted md:text-lg">
          Here is what protects your money while it earns.
        </p>

        {/* bento */}
        <div className="mt-12 grid gap-4 md:grid-cols-2">
          {/* Sentinel — the pillar (tall left) */}
          <article className="sfy-card flex flex-col rounded-lg bg-paper p-7 ring-1 ring-black/[0.04] transition-shadow duration-300 hover:ring-black/[0.08] md:row-span-2 md:p-8">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-[17px] font-semibold tracking-tight text-ink">Sentinel watches every pool.</h3>
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-brand-soft px-2.5 py-1 text-[11px] font-semibold text-brand-ink">
                <span className="sfy-live" /> 24/7
              </span>
            </div>
            <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-muted">
              It checks every pool constantly and moves your funds out the moment one turns unsafe.
            </p>
            <div className="mt-6 flex flex-1 items-center justify-center rounded-md bg-gradient-to-b from-cloud to-[#e9e9e5] py-14">
              <div className="sfy-radar">
                <span className="sfy-ring" />
                <span className="sfy-ring" />
                <span className="sfy-ring" />
                <span className="sfy-dot" />
              </div>
            </div>
          </article>

          {/* Non-custodial */}
          <article className="sfy-card flex flex-col rounded-lg bg-paper p-7 ring-1 ring-black/[0.04] transition-shadow duration-300 hover:ring-black/[0.08]">
            <h3 className="text-[17px] font-semibold tracking-tight text-ink">Your funds stay yours.</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">
              You hold the keys, and nothing moves without your approval.
            </p>
            <VisualSlot icon={<KeyIcon className="h-14 w-14" />} className="mt-6 flex-1 py-10" />
          </article>

          {/* AI agent */}
          <article className="sfy-card flex flex-col rounded-lg bg-paper p-7 ring-1 ring-black/[0.04] transition-shadow duration-300 hover:ring-black/[0.08]">
            <h3 className="text-[17px] font-semibold tracking-tight text-ink">It finds the safest yield for you.</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">
              An agent keeps looking for the safest, highest yield on Stellar, so you never have to.
            </p>
            <VisualSlot icon={<SparkleIcon className="h-14 w-14" />} className="mt-6 flex-1 py-10" />
          </article>

          {/* Vetted pools — wide */}
          <article className="sfy-card flex flex-col rounded-lg bg-paper p-7 ring-1 ring-black/[0.04] transition-shadow duration-300 hover:ring-black/[0.08] md:col-span-2 md:flex-row md:items-center md:gap-8">
            <div className="md:max-w-md">
              <h3 className="text-[17px] font-semibold tracking-tight text-ink">Only pools we trust.</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">
                Your money only goes into pools that have been checked and audited, never an untested one.
              </p>
            </div>
            <VisualSlot icon={<ShieldCheckIcon className="h-14 w-14" />} className="mt-6 h-40 w-full md:mt-0 md:flex-1" />
          </article>
        </div>
      </div>
    </section>
  );
}
