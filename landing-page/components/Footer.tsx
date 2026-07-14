/* Footer — grey, minimal (Tends-style): a one-line-ish blurb, socials + tagline,
   a hairline, a small legal row, and a giant faded "sorosense" wordmark bleeding
   off the bottom. Plus Jakarta Sans only; the interest comes from weight
   (light / regular / medium / bold). Hard cut from the white Safety above. */

const SOCIALS = [
  { label: "X", href: "#" },
  { label: "in", href: "#" },
  { label: "gh", href: "#" },
];

export function Footer() {
  return (
    <footer className="relative overflow-hidden bg-mist px-6 pt-24 sm:px-10 lg:px-[89px]">
      <div className="mx-auto max-w-7xl">
        {/* blurb */}
        <p className="max-w-lg font-display text-xl font-light leading-relaxed tracking-tight text-ink md:text-2xl">
          Non-custodial stablecoin yield on Stellar. Deposit what you hold, and your money is watched around the clock.
        </p>

        {/* socials + tagline */}
        <div className="mt-20 flex flex-col gap-8 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-3">
            {SOCIALS.map((s) => (
              <a
                key={s.label}
                href={s.href}
                aria-label={s.label}
                className="grid h-11 w-11 place-items-center rounded-full border border-ink/20 text-xs font-medium uppercase text-ink/70 transition hover:border-ink/50 hover:text-ink"
              >
                {s.label}
              </a>
            ))}
          </div>
          <p className="text-sm font-normal text-muted sm:text-right md:text-base">
            Stablecoin yield, guarded around the clock.
          </p>
        </div>

        {/* hairline */}
        <div className="mt-10 border-t border-ink/10" />

        {/* legal row */}
        <div className="mt-6 flex flex-col gap-2 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
          <span className="font-medium">© 2026 SoroSense</span>
          <span className="font-normal">Built on Stellar</span>
          <span className="font-normal">All rights reserved</span>
        </div>

        {/* giant wordmark — faded, bleeding off the bottom */}
        <div aria-hidden className="pointer-events-none mt-12 -mb-[1.5vw] select-none">
          <span className="block font-display text-[clamp(4.5rem,21vw,17rem)] font-bold leading-[0.78] tracking-tighter text-ink/[0.06]">
            sorosense
          </span>
        </div>
      </div>
    </footer>
  );
}
