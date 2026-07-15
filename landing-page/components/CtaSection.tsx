"use client";

/* CTA — the closing invite (2D). Just the copy: a big headline, one-line sub,
   and Launch App, centred on white, revealed with a slide-up + blur (the Risk
   story-line style) when it scrolls into view. Sits between Safety and Footer. */

import { useEffect, useRef, useState } from "react";
import { Button } from "./Button";

export function CtaSection() {
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
      { threshold: 0.3 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <section ref={ref} className="flex min-h-[70svh] items-center justify-center bg-white px-6 py-24 text-center">
      <style>{`
        .cta-line{opacity:0;transform:translateY(1.1em);filter:blur(10px);transition:opacity .8s ease,transform .8s cubic-bezier(.22,.61,.25,1),filter .8s ease}
        .cta-line.in{opacity:1;transform:none;filter:blur(0)}
      `}</style>

      <div>
        <h2 className={`cta-line ${shown ? "in" : ""} font-display text-[clamp(3.04rem,5.94vw,5.74rem)] font-normal leading-[1.02] tracking-tight text-ink`}>
          Start earning today.
        </h2>
        <p className={`cta-line ${shown ? "in" : ""} mt-5 text-[1.35rem] leading-relaxed text-muted md:text-[1.5rem]`} style={{ transitionDelay: ".08s" }}>
          Put your stablecoins to work.
        </p>
        <div className={`cta-line ${shown ? "in" : ""} mt-9`} style={{ transitionDelay: ".16s" }}>
          <Button href="https://app.sorosense.xyz" variant="blueSolid">
            Launch App
          </Button>
        </div>
      </div>
    </section>
  );
}
