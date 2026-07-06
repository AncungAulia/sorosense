"use client";

import { useEffect, useState } from "react";
import { Button } from "./Button";

const links = [
  { href: "#how", label: "How it works" },
  { href: "#security", label: "Security" },
  { href: "#faq", label: "FAQ" },
];

function Logo() {
  return (
    <a href="#" className="flex items-center gap-2.5 font-semibold tracking-tight">
      <span
        className="h-[22px] w-[22px] rounded-md"
        style={{
          background:
            "conic-gradient(from 210deg, #9db8f5, #6f8fe6, #b7cbf8, #9db8f5)",
        }}
      />
      SoroSense
    </a>
  );
}

export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const solid = scrolled || open;

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-colors duration-300 ${
        solid
          ? "border-b border-mist bg-cloud/70 backdrop-blur-md backdrop-saturate-150"
          : ""
      }`}
    >
      <nav
        className={`mx-auto grid h-[72px] max-w-7xl grid-cols-[auto_1fr_auto] items-center gap-4 px-6 ${
          solid ? "text-ink" : "text-cloud"
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
              solid ? "border-ink/15" : "border-white/30"
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
        <div className="border-t border-mist bg-cloud px-6 py-4 text-ink md:hidden">
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
