"use client";

/* Safety / Sentinel — the answer to "The Risk". After the dark YieldBlox story,
   this section is plain white (a hard cut from the Risk charcoal, like
   hero to Earn) and lays out how SoroSense guards the funds, in a Plasma-style
   bento: soft grey cards on white, a small title + description top-left, and a
   big visual zone below (image-ready: the `.sfy-visual` panels are placeholders
   to swap for real renders/photos). Blue (brand) is kept to a single live moment
   (the Sentinel radar); everything else stays monochrome/muted, Plasma-style. */

import { useEffect, useRef, useState } from "react";

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
    <section id="safety" ref={ref} className="relative overflow-hidden bg-cloud">
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
              <h3 className="text-[17px] font-semibold tracking-tight text-ink">We watch every pool.</h3>
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-brand-soft px-2.5 py-1 text-[11px] font-semibold text-brand-ink">
                <span className="sfy-live" /> 24/7
              </span>
            </div>
            <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-muted">
              We check every pool constantly and move your funds out the moment one turns unsafe.
            </p>
            {/* the guard acting — a recreation of the app's "Approve safe exit" sheet,
                white + shadow so it lifts off the grey card (fits the frame, not a screenshot) */}
            <div className="mt-6 flex flex-1 items-end justify-center">
              <div className="w-full max-w-[320px] rounded-2xl bg-white p-4 shadow-[0_18px_44px_-20px_rgba(11,11,12,0.32)] ring-1 ring-black/[0.04]">
                <p className="text-[15px] font-semibold tracking-tight text-ink">Approve safe exit</p>
                <p className="mt-1 text-[11px] leading-snug text-muted">
                  We paused your EURC pool after we detected unusual activity in the pool. Approve moving your funds to another EURC pool.
                </p>
                <div className="mt-3 rounded-xl bg-[#f4f4f2] p-3">
                  <div className="flex items-center gap-2.5">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#fbf1e2] text-[#b45309]">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
                    </span>
                    <div className="min-w-0">
                      <div className="text-[10px] text-muted">From</div>
                      <div className="text-[13px] font-semibold text-ink">Paused EURC pool</div>
                    </div>
                    <span className="ml-auto text-[13px] font-semibold text-ink">€1,004.09</span>
                  </div>
                  <div className="my-1.5 flex justify-center text-muted">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v13M7 13l5 5 5-5" /></svg>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#edf0f3] text-ink">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 15l5-5 4 4 7-7" /><path d="M17 7h4v4" /></svg>
                    </span>
                    <div className="min-w-0">
                      <div className="text-[10px] text-muted">To</div>
                      <div className="text-[13px] font-semibold text-ink">DeFindex EURC</div>
                    </div>
                    <span className="ml-auto text-[13px] font-semibold text-[#16a34a]">5.90% APY</span>
                  </div>
                </div>
                <div className="mt-3 rounded-full bg-ink py-2.5 text-center text-[13px] font-semibold text-cloud">Approve and sign in wallet</div>
                <div className="mt-2 rounded-full border border-line py-2.5 text-center text-[13px] font-medium text-ink">Keep it paused</div>
              </div>
            </div>
          </article>

          {/* Non-custodial — key large, tilted 8°, bleeding out of the grey card (masked) */}
          <article className="sfy-card relative flex min-h-[300px] flex-col overflow-hidden rounded-lg bg-paper p-7 ring-1 ring-black/[0.04] transition-shadow duration-300 hover:ring-black/[0.08]">
            <div className="relative z-10">
              <h3 className="text-[17px] font-semibold tracking-tight text-ink">Your funds stay yours.</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">
                You hold the keys, and nothing moves without your approval.
              </p>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/Metalic%20Key.png" alt="A single key you alone hold" className="pointer-events-none absolute left-1/2 top-1/2 max-w-none" style={{ height: 130, transformOrigin: "center", transform: "translate(-50%,-50%) translate(21px,76px) rotate(-22deg) scale(2.44)" }} />
          </article>

          {/* AI agent — robot large on the left (flipped to face right), bleeding out; copy right */}
          <article className="sfy-card relative flex min-h-[230px] items-center overflow-hidden rounded-lg bg-paper p-7 ring-1 ring-black/[0.04] transition-shadow duration-300 hover:ring-black/[0.08]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/Agent.png" alt="An agent scanning Stellar for the safest yield" className="pointer-events-none absolute left-1/2 top-1/2 max-w-none" style={{ height: 200, transformOrigin: "center", transform: "translate(-50%,-50%) translate(-130px,50px) rotate(0deg) scale(1.72) scaleX(-1)" }} />
            <div className="relative z-10 ml-auto max-w-[56%] text-right">
              <h3 className="text-[17px] font-semibold tracking-tight text-ink">It finds the safest yield for you.</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">
                An agent keeps looking for the safest, highest yield on Stellar, so you never have to.
              </p>
            </div>
          </article>

          {/* Vetted pools — wide; shield large on the right, bleeding out of the card (masked) */}
          <article className="sfy-card relative flex min-h-[210px] flex-col justify-center overflow-hidden rounded-lg bg-paper p-7 ring-1 ring-black/[0.04] transition-shadow duration-300 hover:ring-black/[0.08] md:col-span-2">
            <div className="relative z-10 max-w-[60%] md:max-w-md">
              <h3 className="text-[17px] font-semibold tracking-tight text-ink">Only pools we trust.</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">
                Your money only goes into pools that have been checked and audited, never an untested one.
              </p>
            </div>
            {/* shield — mobile transform (narrower card) */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/Shield.png" alt="A shield — only vetted, audited pools" className="pointer-events-none absolute left-1/2 top-1/2 max-w-none md:hidden" style={{ height: 200, transformOrigin: "center", transform: "translate(-50%,-50%) translate(120px,18px) rotate(24deg) scale(1.56)" }} />
            {/* shield — desktop transform */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/Shield.png" alt="" aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 hidden max-w-none md:block" style={{ height: 200, transformOrigin: "center", transform: "translate(-50%,-50%) translate(240px,18px) rotate(24deg) scale(1.82)" }} />
          </article>
        </div>
      </div>
    </section>
  );
}
