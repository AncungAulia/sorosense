"use client";

import { invalidate } from "@react-three/fiber";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useEffect, useRef, useState } from "react";
import { Button } from "./Button";
import { PhoneStage, TableStage } from "./HeroStage";

gsap.registerPlugin(ScrollTrigger);

// Extra viewports each feature section holds (pinned) before the phone moves on
// — a beat to read. Each section's height is tied to its dwell.
// Heavy (Lenis) scroll already gives each stop weight, so no read-hold between
// the feature stops — they flow straight into each other.
const EARN_DWELL = 0;
const PROTECT_DWELL = 0;
// Simulate holds an extra 0.8 viewport so the phone dwells at the last pose —
// encoded directly in the section height (desktop `md:min-h-[180svh]`).

// Maps scroll position (in viewport units, u = scrollY / viewportHeight) to the
// phone's section-space progress (0=hero, 1=Earn, 2=Protect, 3=Simulate). Each
// stop transitions over 1 viewport, then holds for its dwell to be read.
function scrollToPose(u: number) {
  let t = u;
  if (t <= 1) return t; // hero -> Earn
  t -= 1;
  if (t <= EARN_DWELL) return 1; // hold Earn
  t -= EARN_DWELL;
  if (t <= 1) return 1 + t; // Earn -> Protect
  t -= 1;
  if (t <= PROTECT_DWELL) return 2; // hold Protect
  t -= PROTECT_DWELL;
  if (t <= 1) return 2 + t; // Protect -> Simulate
  return 3; // Simulate (held)
}

export function Hero() {
  const [ready, setReady] = useState(false);
  // Section-space scroll progress: 0 = hero, 1 = Earn, 2 = Protect, ...
  const progress = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const phoneFadeRef = useRef<HTMLDivElement>(null);
  // The last feature copy (Simulate) + how far we've scrolled past the feature
  // stack — so on Simulate -> Risk the copy rides up with the white paper
  // instead of fading out.
  const simCopyRef = useRef<HTMLDivElement>(null);
  const pastRef = useRef(0);
  // First feature copy (Earn) + its section top — so hero -> Earn the copy rides
  // onto the white paper instead of fading in over the maroon hero.
  const earnCopyRef = useRef<HTMLDivElement>(null);
  const earnTopRef = useRef(0);

  // On (re)load, always start at the hero — otherwise the browser restores the
  // scroll position and the entrance animation fights the scrubbed Earn pose.
  useEffect(() => {
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    window.scrollTo(0, 0);
    progress.current = 0;
  }, []);

  // Scrolling the whole feature stack scrubs the phone through its poses, with a
  // read dwell at Earn (see scrollToPose).
  useEffect(() => {
    const st = ScrollTrigger.create({
      trigger: containerRef.current,
      start: "top top",
      end: "bottom bottom",
      scrub: true,
      onUpdate: (self) => {
        const vh = window.innerHeight || 1;
        const u = (self.progress * (self.end - self.start)) / vh;
        progress.current = scrollToPose(u);
        invalidate(); // demand mode: render a frame for this scroll tick
      },
    });
    return () => st.kill();
  }, []);

  // The phone is stuck to the white (Simulate) layer: once the feature stack
  // ends, it scrolls up and off with it — like the hero table — instead of
  // sliding onto the grey Risk layer below.
  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const el = containerRef.current;
        const stick = phoneFadeRef.current;
        if (!el || !stick) return;
        const vh = window.innerHeight || 1;
        const mobile = window.matchMedia("(max-width: 767px)").matches;
        // px scrolled past the feature stack; move the phone up by the same.
        const past = Math.min(Math.max(vh - el.getBoundingClientRect().bottom, 0), vh * 1.5);
        stick.style.transform = `translateY(${-past}px)`;
        pastRef.current = past;
        // Mobile: on the Simulate -> Risk exit the copy is pinned to the paper
        // (rides up by the same amount) and stays sharp — no fade-out.
        const sim = simCopyRef.current;
        if (sim) {
          if (mobile && past > 0) {
            sim.classList.add("in");
            sim.style.transform = `translateY(${-past}px)`;
          } else {
            sim.style.transform = "";
          }
        }
        // Mobile: on the hero -> Earn entrance the copy rides DOWN onto the white
        // paper (matching the section's top) and stays sharp — no fade-in, so the
        // text never sits over the maroon hero during the cross-over.
        const earn = earnCopyRef.current;
        if (earn) {
          const top = mobile ? earn.parentElement?.getBoundingClientRect().top ?? -1 : -1;
          earnTopRef.current = top;
          if (top > 0) {
            earn.classList.add("in");
            earn.style.transform = `translateY(${top}px)`;
          } else {
            earn.style.transform = "";
          }
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

  // Mobile only: the phone parks across Earn/Protect/Simulate. Each section is a
  // full-screen spacer; its copy is pinned to the viewport (CSS) and just
  // cross-fades in when its section is the dominant one, out when it leaves — so
  // the text never scrolls, it only blurs in place. Desktop keeps the flight.
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    let io: IntersectionObserver | null = null;
    const copyOf = (section: Element) =>
      section.querySelector<HTMLElement>(".feature-copy");
    const sections = () =>
      Array.from(containerRef.current?.querySelectorAll<HTMLElement>(".feature-section") ?? []);
    const connect = () => {
      if (io) return;
      io = new IntersectionObserver(
        (entries) => {
          entries.forEach((e) => {
            const copy = copyOf(e.target);
            if (!copy) return;
            const on = e.isIntersecting && e.intersectionRatio >= 0.55;
            if (on) {
              copy.classList.add("in");
            } else if (
              !(copy === simCopyRef.current && pastRef.current > 0) &&
              !(copy === earnCopyRef.current && earnTopRef.current > 0)
            ) {
              // Keep the edge copies sharp while they ride the paper across a
              // coloured boundary (Earn in from the hero, Simulate out into Risk);
              // otherwise fade the copy out as usual.
              copy.classList.remove("in");
            }
          });
        },
        { threshold: [0, 0.55, 1] },
      );
      sections().forEach((s) => io!.observe(s));
    };
    const disconnect = () => {
      io?.disconnect();
      io = null;
      sections().forEach((s) => copyOf(s)?.classList.remove("in"));
    };
    const sync = () => (mq.matches ? connect() : disconnect());
    sync();
    mq.addEventListener("change", sync);
    return () => {
      mq.removeEventListener("change", sync);
      disconnect();
    };
  }, []);

  return (
    <div ref={containerRef} className="relative">
      {/* Phone overlay — fixed above everything, transparent. Not part of the
          hero frame, so it flies across into the next section. */}
      <div
        className={`pointer-events-none fixed inset-0 z-20 transition-opacity duration-300 ease-out ${
          ready ? "opacity-100" : "opacity-0"
        }`}
      >
        <div ref={phoneFadeRef} className="h-full w-full">
          <PhoneStage progress={progress} onReady={() => setReady(true)} />
        </div>
      </div>

      {/* Hero frame — maroon backdrop + 3D table, clipped to this section so it
          scrolls away with the copy at the same speed. */}
      <section className="relative min-h-[100svh] overflow-hidden bg-[#160f0a]">
        <div
          className={`absolute inset-0 z-0 transition-opacity duration-300 ease-out ${
            ready ? "opacity-100" : "opacity-0"
          }`}
        >
          <TableStage progress={progress} />
        </div>

        <div
          className={`relative z-10 flex min-h-[100svh] flex-col items-center justify-start px-6 pt-[104px] text-center sm:px-10 md:items-start md:justify-center md:pt-[72px] md:text-left lg:pl-[89px] xl:pl-[121px] ${
            ready ? "is-ready" : ""
          }`}
        >
          {/* mobile title — smaller, forced to 2 lines */}
          <h1 className="font-display text-[1.7rem] font-normal leading-[1.12] tracking-tight text-cloud md:hidden">
            <span className="mask-line">
              <span style={{ animationDelay: "0.7s" }}>Stablecoin yield,</span>
            </span>
            <span className="mask-line">
              <span style={{ animationDelay: "0.78s" }}>guarded around the clock</span>
            </span>
          </h1>
          {/* desktop title — original 3 lines */}
          <h1 className="hidden font-display text-[clamp(2.35rem,4.7vw,6rem)] font-normal leading-[1.08] tracking-tight text-cloud md:block">
            <span className="mask-line">
              <span style={{ animationDelay: "0.7s" }}>Stablecoin yield,</span>
            </span>
            <span className="mask-line">
              <span style={{ animationDelay: "0.78s" }}>guarded around the</span>
            </span>
            <span className="mask-line">
              <span style={{ animationDelay: "0.86s" }}>clock</span>
            </span>
          </h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-white/75 md:mx-0 md:mt-7 md:text-xl">
            <span className="mask-line">
              <span style={{ animationDelay: "0.96s" }}>
                The stablecoins you hold, earning the safest and highest yield on
                Stellar.
              </span>
            </span>
          </p>
          {/* mobile button — smaller so it clears the phone */}
          <div className="reveal-up mt-5 md:hidden" style={{ animationDelay: "1.06s" }}>
            <Button href="#" variant="blue" size="sm">
              Get started
            </Button>
          </div>
          {/* desktop button */}
          <div className="reveal-up mt-8 hidden md:block" style={{ animationDelay: "1.06s" }}>
            <Button href="#" variant="blue">
              Get started
            </Button>
          </div>
        </div>
      </section>

      {/* Earn — white; the phone flew in on the left. The section is taller than
          a viewport and its copy is pinned (sticky) so it holds for a beat
          (EARN_DWELL) to be read before the phone moves on to Protect. */}
      <section className="feature-section relative min-h-[100svh] bg-white">
        <div
          ref={earnCopyRef}
          className="feature-copy sticky top-0 z-10 flex h-[100svh] flex-col items-center justify-between px-6 pt-[92px] pb-[calc(env(safe-area-inset-bottom,0px)_+_28px)] text-center sm:px-10 md:items-end md:justify-center md:py-0 md:pt-[72px] md:text-right lg:pr-[89px] xl:pr-[121px]"
        >
          {/* headline group — top on mobile, right block on desktop */}
          <div className="max-w-[86vw] text-ink sm:max-w-2xl md:-translate-y-[25px]">
            <p className="font-display text-4xl font-normal leading-none tracking-tight text-brand-ink md:text-5xl">
              Earn
            </p>

            <div className="mt-3 flex items-baseline justify-center gap-x-2 tabular-nums sm:gap-x-2.5 md:justify-end">
              <span className="text-xl text-muted sm:text-2xl md:text-3xl">up to</span>
              <span className="font-display text-5xl font-normal leading-none sm:text-6xl md:text-8xl">
                8.59%
              </span>
              <span className="text-xl sm:text-2xl md:text-3xl">APY</span>
            </div>

            <p className="mt-1 font-display text-3xl font-normal leading-tight tracking-tight sm:text-4xl md:text-6xl">
              on your stablecoins
            </p>

            {/* desktop: subtitle stays grouped under the block */}
            <p className="mt-5 hidden text-sm text-muted md:block md:text-lg">
              The highest safe yield on Stellar right now, and always variable.
            </p>
          </div>

          {/* mobile: subtitle drops to the bottom, phone sits between */}
          <p className="max-w-xs text-sm text-muted md:hidden">
            The highest safe yield on Stellar right now, and always variable.
          </p>
        </div>
      </section>

      {/* Protect — white; phone on the right, held for a read beat. */}
      <section className="feature-section relative min-h-[100svh] bg-white">
        <div className="feature-copy sticky top-0 z-10 flex h-[100svh] flex-col items-center justify-between px-6 pt-[92px] pb-[calc(env(safe-area-inset-bottom,0px)_+_28px)] text-center sm:px-10 md:items-start md:justify-center md:py-0 md:pt-[72px] md:text-left lg:pl-[89px] xl:pl-[121px]">
          {/* headline group — top on mobile, left block on desktop */}
          <div className="max-w-[86vw] text-ink sm:max-w-xl">
            <p className="font-display text-4xl font-normal leading-none tracking-tight text-brand-ink md:text-5xl">
              Protect
            </p>
            <h2 className="mt-3 font-display text-[clamp(2.25rem,4.4vw,4.25rem)] font-normal leading-[1.05] tracking-tight">
              Guarded around the clock.
            </h2>
            {/* desktop: subtitle stays grouped under the block */}
            <p className="mx-auto mt-5 hidden max-w-md text-base text-muted md:mx-0 md:block md:text-lg">
              Sentinel watches every pool and pulls your funds out the moment one
              turns dangerous.
            </p>
          </div>

          {/* mobile: subtitle drops to the bottom, phone sits between */}
          <p className="max-w-xs text-base text-muted md:hidden">
            Sentinel watches every pool and pulls your funds out the moment one
            turns dangerous.
          </p>
        </div>
      </section>

      {/* Simulate — white; the phone rests in the centre, flanked by copy. */}
      <section className="feature-section relative min-h-[100svh] bg-white md:min-h-[180svh]">
        <div
          ref={simCopyRef}
          className="feature-copy sticky top-0 z-10 flex h-[100svh] flex-col items-center justify-between gap-6 px-6 pt-[92px] pb-[calc(env(safe-area-inset-bottom,0px)_+_28px)] text-center sm:px-10 md:flex-row md:items-center md:justify-between md:py-0 md:pt-[72px] md:text-left lg:px-[89px] xl:px-[121px]"
        >
          {/* copy1 (left on desktop, top on mobile) */}
          <div className="max-w-sm text-ink">
            <p className="font-display text-4xl font-normal leading-none tracking-tight text-brand-ink md:text-5xl">
              Simulate
            </p>
            <h2 className="mt-3 font-display text-[clamp(2.25rem,4.4vw,4.25rem)] font-normal leading-[1.05] tracking-tight">
              See it before you deposit.
            </h2>
          </div>

          {/* copy2 (right on desktop, bottom on mobile) */}
          <div className="max-w-xs text-muted md:text-right">
            <p className="text-base md:text-lg">
              Enter any amount and any period, and get an exact projection of
              what you&apos;d earn.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
