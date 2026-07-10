"use client";

import { useEffect, useState } from "react";
import { Button } from "./Button";

const links = [
  { href: "#how", label: "How it works" },
  { href: "#security", label: "Security" },
  { href: "#faq", label: "FAQ" },
];

const HERO_BG = "#160f0a"; // matches the hero section background
const NAV_H = 72;

/* Vector-3 wordmark, recolored via CSS mask so it follows the nav text colour
   (cloud over the hero, ink once past it). */
function Logo() {
  const src = encodeURI("/logos/Vector-3.svg");
  const height = 44;
  const width = Math.round(height * (1402 / 696));
  return (
    <a href="#" aria-label="SoroSense" className="flex items-center">
      <span
        role="img"
        aria-label="SoroSense"
        style={{
          display: "inline-block",
          height,
          width,
          transform: "translate(0px, 2px)",
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

export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [pastHero, setPastHero] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      setScrolled(y > 24);
      // Flip to the white theme only once the navbar clears the hero section.
      setPastHero(y >= window.innerHeight - NAV_H);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  const glass = scrolled || open; // show a glass background at all
  const white = pastHero; // glass tint + text theme: white vs maroon

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-colors duration-300 ${
        glass
          ? white
            ? "bg-cloud/70 backdrop-blur-md backdrop-saturate-150"
            : "backdrop-blur-md backdrop-saturate-150"
          : ""
      }`}
      style={glass && !white ? { backgroundColor: `${HERO_BG}b3` } : undefined}
    >
      <nav
        className={`mx-auto grid h-[72px] max-w-7xl grid-cols-[auto_1fr_auto] items-center gap-4 px-6 transition-colors duration-300 ${
          white ? "text-ink" : "text-cloud"
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
          <Button
            href="#"
            size="sm"
            variant="blue"
            className="hidden sm:inline-flex"
          >
            Launch app
          </Button>

          {/* Hamburger (mobile) */}
          <button
            type="button"
            aria-label="Toggle menu"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className={`inline-flex h-10 w-10 items-center justify-center rounded-full border md:hidden ${
              white ? "border-ink/15" : "border-white/30"
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
            white ? "border-mist bg-cloud text-ink" : "border-white/10 text-cloud"
          }`}
          style={!white ? { backgroundColor: HERO_BG } : undefined}
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
            <Button href="#" variant="blue" className="mt-3 w-full">
              Launch app
            </Button>
          </div>
        </div>
      )}
    </header>
  );
}
