# SoroSense Landing — Design Guidelines

Reference: **Plasma One** (plasma.org/personal). We follow its visual language —
restraint, whitespace, big light-weight type, one accent, real product shots —
but with **our copy** (invisible-safety + YieldBlox) and **our palette** (violet).

> North star: if a choice looks like a generic AI landing page (glow blobs,
> glass cards, neon gradients, everything bold), it's wrong. Plasma is calm,
> confident, and spacious. Copy that feeling, not just the layout.

---

## 1. Principles (the Plasma way)

1. **Whitespace is the design.** Sections breathe. Big vertical padding, wide
   margins, few elements per screen. When unsure, add space, remove elements.
2. **Type is large but light.** Headlines are big and set in **normal/medium
   weight (400–500), never bold 700**. Tight tracking, tight leading. This is
   the single biggest "not-AI-slop" signal — resist `font-bold` everywhere.
3. **One accent, used sparingly.** Violet leads; everything else is neutral
   (paper / white / grey / ink). Accent appears on CTAs and a few highlights —
   not on every element.
4. **Product is the hero.** Each feature section is carried by a phone mockup
   (Axel's app screens), not by decoration.
5. **Flat and clean.** Light-grey cards, subtle or no shadows, moderate radius,
   pill buttons. No glassmorphism, no gradient soup.
6. **Rhythm through contrast.** Alternate dark (violet) ↔ light (paper) sections
   so the page has a heartbeat, like Plasma's green ↔ white alternation.

## 2. DON'T (anti-AI-slop checklist)

- ❌ Gradient "glow" blobs / radial haze behind the hero
- ❌ Glassmorphism (frosted translucent cards), neon, gradient text
  — **one exception: the sticky navbar** uses a frosted-glass bar (see §6 Nav),
  exactly like Plasma. Glass is allowed there and nowhere else.
- ❌ `font-bold` on headings — use `font-normal` / `font-medium`
- ❌ Drop-shadow soup; heavy borders on everything
- ❌ Emoji as decoration; random icon badges
- ❌ Cramped spacing / many small elements competing
- ❌ More than one accent hue (violet only; maroon is functional, not decorative)

## 3. Color application (tokens in `app/globals.css`)

| Context | Background | Text | CTA |
| --- | --- | --- | --- |
| Dark sections (Hero, Sentinel) | `bg-night` (`#241C4D`) | `text-cloud` / `text-halo` | `bg-iris` + `text-ink` |
| Light sections (Earn, Buckets, CTA) | `bg-paper` (`#EFEFED`) | `text-ink` / `text-muted` | `bg-ink` + `text-cloud` |
| Danger section (YieldBlox) | `bg-maroon` (`#7A2E43`) | `text-cloud` | — |
| Cards on light | `bg-cloud` / `bg-mist` | `text-ink` | — |

Rule of thumb (mirrors Plasma): **accent pill on dark backgrounds, dark/ink pill
on light backgrounds.** Iris also carries links, small highlights, and the
active nav state.

## 4. Typography

Font: **Plus Jakarta Sans** (open-source / OFL), loaded via `next/font/google`
in `layout.tsx` and exposed as `--font-jakarta` → `--font-display` / `--font-body`
in `globals.css`. System stack (`-apple-system`, Segoe UI, Roboto) is the fallback.

| Role | Size (Tailwind) | Weight | Tracking / leading |
| --- | --- | --- | --- |
| Hero H1 | `text-5xl` → `md:text-7xl` | `font-normal` (400) | `tracking-tight leading-[1.05]` |
| Section H2 | `text-4xl` → `md:text-5xl` | `font-normal` | `tracking-tight`, centered |
| Big stat number | `text-7xl` → `md:text-8xl` | `font-normal` | `tabular-nums tracking-tight` |
| Card title | `text-xl` | `font-medium` (500) | — |
| Body | `text-lg` | `font-normal` | `leading-relaxed text-muted`, `max-w-[42ch]` |
| Eyebrow / caption | `text-sm` | `font-medium` | `text-muted` |

Notes:
- Stats use the "up to" pattern: tiny label on top, huge number, small caption
  under (e.g. `up to` / **8.59%** / `APY on your stablecoins`).
- Numbers always `tabular-nums` so digits align.

## 5. Spacing & layout

- **Container:** `mx-auto max-w-6xl px-6` (hero copy can go narrower, `max-w-4xl`).
- **Section padding:** `py-24 md:py-32` (hero up to `md:py-40`).
- **Grid gaps:** generous (`gap-6` to `gap-10`).
- Desktop-first: design the desktop layout, then add mobile behaviour with
  `md:` etc. (per project decision — landing is responsive but desktop-first).

## 6. Components (build these in `landing-page/components/`)

- **`Nav`** — **frosted-glass sticky bar, Plasma-style** (the one sanctioned use
  of glassmorphism). Spec:
  - **Position:** `fixed top-0 inset-x-0 z-50`, full-width. Content aligned to
    the same `max-w-6xl` container as the page, but the glass background spans
    edge-to-edge.
  - **Height:** `h-16 md:h-20` (~64–80px), vertically centered content.
  - **Glass:** `backdrop-blur-md` + a translucent background. **Adaptive on
    scroll** (a small `"use client"` scroll hook toggles a `scrolled` state):
    - _At top (over the hero):_ background transparent; logo + links `text-cloud`
      (white); "Launch app" pill = `bg-iris text-ink`.
    - _Scrolled:_ `bg-paper/70 backdrop-blur-md border-b border-mist` with a
      faint shadow; logo + links `text-ink`; pill `bg-ink text-cloud`.
  - **Layout:** logo (icon + "SoroSense" wordmark) left · centered link group
    (`gap-8 text-sm font-medium`) · right = "Launch app" pill. Optional small
    globe/lang icon before the pill (like Plasma) — skip if it adds noise.
  - **Links:** our sections — e.g. `The risk` · `Earn` · `Safety` · `Buckets`.
  - Add `scroll-mt-24` to section anchors so the fixed bar doesn't cover them,
    and give the page top padding equal to the bar height so the hero isn't
    hidden underneath.
- **`Button`** — pill: `rounded-full px-7 py-3.5 text-base font-medium`.
  Variants: `primary` (context-aware: iris on dark, ink on light), `ghost`
  (outline `border-halo/30` on dark, `border-ink/15` on light).
- **`PhoneMock`** — dark rounded phone frame wrapping one of Axel's app screens
  (Home / Earn). Static; treated as product imagery.
- **`Section`** — wrapper applying the padding + container rules.
- **`StatBlock`** — the "up to / big number / caption" unit.
- **`BentoCard`** — rounded-`3xl` light-grey card, `p-8`, title + short body +
  optional visual. No heavy shadow.
- **`Footer`** — logo, column links, legal line, socials.

## 7. Section blueprints (top → bottom)

Order and content follow plan U18 + the agreed structure.

1. **Hero** — `bg-night`. Centered eyebrow → big light H1 ("Stablecoin yield,
   guarded around the clock") → one-line subcopy → primary CTA (+ ghost
   "See the yield") → `PhoneMock` (Home screen). No glow, no badge clutter.
2. **The Problem (YieldBlox)** — `bg-maroon`. Centered heading + the $10.8M drain
   story as a short, sober paragraph. This is the emotional turn; keep it stark.
3. **Earn** — `bg-paper`. Asymmetric: `StatBlock` ("up to 8.59% APY") on one
   side, `PhoneMock` (Earn screen) on the other. Real number from our catalog.
4. **Buckets** — `bg-paper` or `bg-night`. Explain per-currency buckets
   (USDC / EURC / CETES), "no conversion, no impermanent loss." Simple row of
   currency chips + short copy.
5. **Sentinel safety** — `bg-night`. Centered heading ("Your money stays safe —
   even while you sleep") + `BentoCard` grid: invisible safety engine,
   non-custodial, avoids the traps, auto-freeze on anomaly.
6. **Final CTA** — `bg-paper`. Centered "Start earning in minutes" + primary CTA.
7. **Footer** — quiet, neutral.

Copy voice: plain, confident, specific. Name what the user controls. No jargon
(no "risk tier", no "APY chasing"), no hype. Active voice.

## 8. Motion (optional, minimal)

Subtle fade-up on scroll for section content; nothing more. Always respect
`prefers-reduced-motion` (already handled globally in `globals.css`).

## 9. Build conventions

- Compose sections in `app/page.tsx` from `components/`.
- Tailwind utilities only; colors/fonts come from the `@theme` tokens.
- Keep the palette-proof strip out of the final page (it's temporary).
- Verify with `pnpm --filter landing-page build` before committing.
