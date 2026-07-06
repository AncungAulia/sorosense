"use client";

import { useState } from "react";
import { Button } from "./Button";
import { HeroStage } from "./HeroStage";

export function Hero() {
  // Becomes true once the 3D models have loaded — gates the text entrance.
  const [ready, setReady] = useState(false);

  return (
    <section className="relative min-h-[100svh] overflow-hidden bg-[#160f0a]">
      {/* Full-bleed 3D table + phone — fades in over 0.3s once loaded */}
      <div
        className={`absolute inset-0 transition-opacity duration-300 ease-out ${
          ready ? "opacity-100" : "opacity-0"
        }`}
      >
        <HeroStage onReady={() => setReady(true)} />
      </div>

      {/* Left-side readability gradient */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/55 via-black/25 to-transparent" />

      {/* Copy overlay — animations start only when `is-ready` is present */}
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
  );
}
