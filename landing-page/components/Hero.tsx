"use client";

import { invalidate } from "@react-three/fiber";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useEffect, useRef, useState } from "react";
import { Button } from "./Button";
import { PhoneStage, TableStage } from "./HeroStage";

gsap.registerPlugin(ScrollTrigger);

export function Hero() {
  const [ready, setReady] = useState(false);
  const progress = useRef(0);
  const heroRef = useRef<HTMLDivElement>(null);

  // On (re)load, always start at the hero — otherwise the browser restores the
  // scroll position and the entrance animation fights the scrubbed Earn pose.
  useEffect(() => {
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    window.scrollTo(0, 0);
    progress.current = 0;
  }, []);

  // One viewport of scroll scrubs the phone from the hero pose to the Earn pose.
  useEffect(() => {
    const st = ScrollTrigger.create({
      trigger: heroRef.current,
      start: "top top",
      end: "bottom top",
      scrub: true,
      onUpdate: (self) => {
        progress.current = self.progress;
        invalidate(); // demand mode: render a frame for this scroll tick
      },
    });
    return () => st.kill();
  }, []);

  return (
    <div className="relative">
      {/* Phone overlay — fixed above everything, transparent. Not part of the
          hero frame, so it flies across into the next section. */}
      <div
        className={`pointer-events-none fixed inset-0 z-20 transition-opacity duration-300 ease-out ${
          ready ? "opacity-100" : "opacity-0"
        }`}
      >
        <PhoneStage progress={progress} onReady={() => setReady(true)} />
      </div>

      {/* Hero frame — maroon backdrop + 3D table, clipped to this section so it
          scrolls away with the copy at the same speed. */}
      <section
        ref={heroRef}
        className="relative min-h-[100svh] overflow-hidden bg-[#160f0a]"
      >
        <div
          className={`absolute inset-0 z-0 transition-opacity duration-300 ease-out ${
            ready ? "opacity-100" : "opacity-0"
          }`}
        >
          <TableStage progress={progress} />
        </div>

        <div
          className={`relative z-10 flex min-h-[100svh] flex-col justify-center px-6 pt-[72px] sm:px-10 lg:pl-[89px] xl:pl-[121px] ${
            ready ? "is-ready" : ""
          }`}
        >
          <h1 className="font-display text-[clamp(1.6rem,4.7vw,6rem)] font-normal leading-[1.08] tracking-tight text-cloud">
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
          <p className="mt-7 max-w-md text-lg leading-relaxed text-white/75 md:text-xl">
            <span className="mask-line">
              <span style={{ animationDelay: "0.96s" }}>
                The stablecoins you hold, earning the safest and highest yield on
                Stellar.
              </span>
            </span>
          </p>
          <div className="reveal-up mt-8" style={{ animationDelay: "1.06s" }}>
            <Button href="#" variant="blue">
              Get started
            </Button>
          </div>
        </div>
      </section>

      {/* Earn — white section; the phone has flown in on the left. */}
      <section className="relative z-10 flex min-h-[100svh] items-center justify-end bg-white px-6 pt-[72px] sm:px-10 lg:pr-[89px] xl:pr-[121px]">
        <div className="max-w-2xl -translate-y-[25px] text-right text-ink">
          <p className="font-display text-4xl font-normal leading-none tracking-tight text-brand-ink md:text-5xl">
            Earn
          </p>

          <div className="mt-3 flex items-baseline justify-end gap-x-2.5 tabular-nums">
            <span className="text-2xl text-muted md:text-3xl">up to</span>
            <span className="font-display text-6xl font-normal leading-none md:text-8xl">
              8.59%
            </span>
            <span className="text-2xl md:text-3xl">APY</span>
          </div>

          <p className="mt-1 font-display text-4xl font-normal leading-tight tracking-tight md:text-6xl">
            on your stablecoins
          </p>

          <p className="mt-5 text-base text-muted md:text-lg">
            The highest safe yield on Stellar right now, and always variable.
          </p>
        </div>
      </section>
    </div>
  );
}
