"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "./Button";

const links = [
  { href: "#earn", label: "Earn" },
  { href: "#risk", label: "Risk" },
  { href: "#safety", label: "Safety" },
];

const APP_URL = "https://app.sorosense.xyz";

const DARK_GLASS = "rgba(22,17,13,0.72)"; // warm dark glass over hero + Risk
const DARK_PANEL = "#161310"; // solid dark for the mobile menu

/* soro sense wordmark, recolored via CSS mask so it follows the nav text colour. */
function Logo() {
  const src = encodeURI("/logos/soro sense.svg");
  const height = 37;
  const width = Math.round(height * (1105 / 533));
  return (
    <a href="#" aria-label="SoroSense" className="flex items-center">
      <span
        role="img"
        aria-label="SoroSense"
        style={{
          display: "inline-block",
          height,
          width,
          backgroundColor: "currentColor",
          transition: "background-color 300ms ease",
          WebkitMaskImage: `url("${src}")`,
          maskImage: `url("${src}")`,
          WebkitMaskRepeat: "no-repeat",
          maskRepeat: "no-repeat",
          WebkitMaskSize: "contain",
          maskSize: "contain",
          WebkitMaskPosition: "center",
          maskPosition: "center",
        }}
      />
    </a>
  );
}

// Luminance of a CSS colour, or null if (near-)transparent / unparseable — so
// the sampler sees through glassy, semi-transparent layers (e.g. the Risk
// notification cards) to the solid background painted behind them.
function luminance(color: string): number | null {
  const m = color.match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const [r, g, b, a = 1] = m[1].split(",").map((s) => parseFloat(s));
  if (a < 0.5) return null;
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

// Is the painted background directly behind the navbar dark? The threshold is
// generous (160) so the navbar already flips to dark glass while the Risk
// section is only greying, not just once it reaches full charcoal.
function bgIsDark(header: HTMLElement | null): boolean {
  const els = document.elementsFromPoint(window.innerWidth / 2, 40);
  for (const el of els) {
    if (header && header.contains(el)) continue;
    const l = luminance(getComputedStyle(el).backgroundColor);
    if (l === null) continue; // transparent — keep looking behind
    return l < 160;
  }
  return false;
}

export function Nav() {
  const headerRef = useRef<HTMLElement>(null);
  const [scrolled, setScrolled] = useState(false);
  const [dark, setDark] = useState(true); // hero starts dark
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        setScrolled(window.scrollY > 24);
        setDark(bgIsDark(headerRef.current));
      });
    };
    onScroll();
    // Re-sample after the hero has painted, so the top-of-hero theme is right
    // even without any scroll.
    const t1 = setTimeout(onScroll, 200);
    const t2 = setTimeout(onScroll, 700);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t1);
      clearTimeout(t2);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  const glass = scrolled || open; // show a glass background at all

  return (
    <header
      ref={headerRef}
      className={`fixed inset-x-0 top-0 z-50 transition-colors duration-300 ${
        glass
          ? dark
            ? "backdrop-blur-md backdrop-saturate-150"
            : "bg-cloud/70 backdrop-blur-md backdrop-saturate-150"
          : ""
      }`}
      style={glass && dark ? { backgroundColor: DARK_GLASS } : undefined}
    >
      <nav
        className={`mx-auto grid h-[72px] max-w-7xl grid-cols-[auto_1fr_auto] items-center gap-4 px-5 transition-colors duration-300 sm:px-6 ${
          dark ? "text-cloud" : "text-ink"
        }`}
      >
        <Logo />

        {/* Centered links (desktop) */}
        <div className="hidden justify-center gap-9 text-sm font-medium md:flex">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="opacity-85 transition hover:opacity-100"
            >
              {l.label}
            </a>
          ))}
        </div>

        {/* Right */}
        <div className="flex items-center justify-end gap-3">
          <div className="hidden sm:block">
            <Button href={APP_URL} target="_blank" rel="noreferrer" size="sm" variant="blue">
              Launch app
            </Button>
          </div>

          {/* Hamburger (mobile) */}
          <button
            type="button"
            aria-label="Toggle menu"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className={`-mr-1.5 inline-flex h-10 w-10 items-center justify-center rounded-full border md:hidden ${
              dark ? "border-white/30" : "border-ink/15"
            }`}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              {open ? (
                <>
                  <path d="M6 6l12 12" />
                  <path d="M18 6L6 18" />
                </>
              ) : (
                <>
                  <path d="M4 7h16" />
                  <path d="M4 12h16" />
                  <path d="M4 17h16" />
                </>
              )}
            </svg>
          </button>
        </div>
      </nav>

      {/* Mobile menu panel */}
      {open && (
        <div
          className={`border-t px-6 py-4 md:hidden ${
            dark ? "border-white/10 text-cloud" : "border-mist bg-cloud text-ink"
          }`}
          style={dark ? { backgroundColor: DARK_PANEL } : undefined}
        >
          <div className="flex flex-col gap-1">
            {links.map((l) => (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="py-2 text-base font-medium"
              >
                {l.label}
              </a>
            ))}
            <Button href={APP_URL} target="_blank" rel="noreferrer" variant="blue" className="mt-3 w-full">
              Launch app
            </Button>
          </div>
        </div>
      )}
    </header>
  );
}
