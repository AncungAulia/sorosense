---
title: U13 — Next.js scaffold + wallet-connect + app shell — Design Spec
date: 2026-07-06
unit: U13
linear: STE-23
parent: STE-7
requirements: [R12, R13, R16]
depends_on: U2 (packages/vault-client — mock/stub)
visual_source: docs/mockups/sorosense-mock-2.html
---

# U13 — Next.js scaffold + wallet-connect + app shell

## 1. Context

- **Ticket:** STE-23 (unit U13), parent STE-7 (frontend track, owner Ancung).
- **Goal:** Mobile-first Next.js app with Freighter-first wallet-connect and the shared UI shell (bottom nav + design tokens/primitives), extracted **once**, imported by every screen (DRY).
- **Requirements:** R12 (wallet-connect via Stellar Wallets Kit, Freighter-first, standalone + in-Discover), R13 (fund movements signed in wallet, non-custodial), R16 (mobile-first web).
- **Dependency:** U2 = `packages/vault-client` (shared interface + TS mock). U13 does not consume it directly (that starts at U14), but the workspace must resolve it.
- **Visual source of truth:** `docs/mockups/sorosense-mock-2.html` — a Plasma-inspired, monochrome redesign that **supersedes `sorosense-mock-1.html` for the design language**. Product invariants from STE-7 still hold. mock-2 is a **proposal**; see §11 Governance.

## 2. Scope — what U13 delivers

1. **Design tokens + shell primitives** extracted from mock-2, once, into `frontend/components/ui/`.
2. **Wallet-connect layer** (Freighter-first) + React context provider + hook.
3. **Routing skeleton:** landing (`/`, intro + connect) + `(app)` shell (bottom nav) + 3 placeholder tab pages (Home/Earn/Account).
4. **Scaffold reconciliation:** make `frontend/` a proper pnpm-workspace member (scaffolded with npm originally); read `node_modules/next/dist/docs/` before writing Next code (Next 16 has breaking changes per `frontend/AGENTS.md`).
5. **Unit-test infra** (Vitest + React Testing Library) covering the U13 test scenarios.

**Explicitly NOT in U13** (downstream units): actual screen content — Home buckets, Earn simulator/growth, Account content, deposit/withdraw keypad pages, Add funds, Activity page, freeze banner/exit drawer. Those are U14 / U15 / U16. Captured as **downstream notes** in §10 so nothing is lost.

## 3. Design system — tokens

Extracted from mock-2 `:root`. Delivered as Tailwind v4 `@theme` in `app/globals.css` (CSS-first; **no** `tailwind.config.js`).

**Palette — monochrome + semantic-only (no brand/primary color):**
- Foundation: `--ink #111316`, `--ink-2 #2b3033`, `--muted #808080`, `--faint #a6a6a6`
- Surfaces: `--bg #F2F2F2`, `--card #F8F8F8`, `--pill #F0F0F0`, `--pill-ink #505050`, `--line #E6E6E6`, `--line-2 #DEDEDE`
- Semantic accents ONLY: `--pos #16a34a` (positive/yield), `--neg #c0453b` (danger/loss), `--warn #b45309` / `--warn-soft #fbf1e2` (**attention/caution** — freeze/paused states)
- Primary action = **ink** (dark), never a brand color.

**Radius:** phone 46, sheet 26, card 22, pill 999, button/field 16.
**Shadow:** `--sh-card` (card lift), `--sh-soft` (icon/pill lift), `--sh-float` (sheet). Cards use a **white 1px edge + soft shadow** (not a dark border).
**Type:** **Switzer** (Fontshare, free-commercial), self-hosted via `next/font/local`. Weights ≤ 600 everywhere (400/500/600). Numbers use `tabular-nums`.

## 4. Components — `frontend/components/ui/`

Two clearly-named component families:

- **Button (`<Button>`)** — capsule, **dimensional**. Dark variant = gradient + inset highlight + inset bottom shadow + drop shadow. Light variant = white + soft shadow + inner highlight. Used for primary/secondary actions (Deposit, Add funds, Move to wallet, Connect, etc.).
- **Pill / toggle** — capsule, **flat**, borderless. Active state = `--pill` fill (or `#ECECEC` where specified). Used for segmented toggles (Day/Week…), filter tabs, currency selector, chips/tags.

Shell primitives to build in U13 (the rest can follow the same convention in U14/U16):
- `Card` (white edge + soft shadow), `BottomNav` (3-tab, `space-around`, active pill; + **progressive blur** overlay above it), `BottomSheet` + `Scrim`, `Toast` (**frosted-glass monochrome**: translucent white + backdrop-blur, ink text, ink check).
- Foundational atoms as needed: `Coin` (currency badge), `Chip`/`Tag` (small `dtag`), `ListRow`, `Field`, `Switch`, `IconButton` (white edge + soft shadow).

Convention: primitives never re-styled per screen; screen units compose them.

## 5. Wallet layer

- **`frontend/lib/wallet.ts`** — capability module, lazy-init (never module scope). Stellar Wallets Kit with **Freighter default**; fallback xBull/Lobstr/WalletConnect; `@stellar/freighter-api` for the in-Discover path. API: `connect() → address`, `getAddress()`, `signTransaction(xdr)`, `disconnect()`.
- **`frontend/providers/WalletProvider.tsx`** — `"use client"` React context; init in `useEffect`; holds `{ address, isConnected, connect, disconnect, signTransaction }`; persists connection in `localStorage`.
- **`frontend/hooks/useWallet.ts`** — consumer hook.
- **KTD7:** all wallet code client-only (`"use client"` + `useEffect`) — no `window is not defined` / hydration issues.
- **New deps:** `@creit.tech/stellar-wallets-kit`, `@stellar/freighter-api`.

## 6. Routing & auth-gate

```
app/layout.tsx          root: <html>, font, <WalletProvider>
app/page.tsx            "/" — onboarding hero → "Connect your wallet"
app/(app)/layout.tsx    shell: <BottomNav> + progressive blur + safe-area
app/(app)/home/page.tsx     placeholder (→ U14)
app/(app)/earn/page.tsx     placeholder (→ U16)
app/(app)/account/page.tsx  placeholder (→ U16)
```
- Auth-gate = **client provider** (non-custodial, no server session). `/` shows onboarding; after connect → `router.push('/home')`. `(app)/layout` redirects to `/` if not connected. Nav = real routing (`usePathname` for active state), not show/hide.

## 7. Folder structure (root convention, per plan)

`app/`, `components/ui/`, `components/<feature>/` (U14+), `lib/`, `providers/`, `hooks/`. **Delete the empty `frontend/src/` skeleton** (avoid two parallel structures). App Router stays at `frontend/app/` (root).

## 8. Scaffold reconciliation

- Root is a **pnpm monorepo** (`pnpm-workspace.yaml`: backend, frontend, landing-page, packages/*). Run `pnpm install` at the **root**, never `npm install` inside `frontend/`.
- Stack: Next **16.2.10**, React **19.2.4**, Tailwind **v4**. **Read `node_modules/next/dist/docs/` before writing Next code** (breaking changes; `frontend/AGENTS.md`).
- Font: download Switzer woff2 from Fontshare → `next/font/local`.

## 9. Testing & verification

- **U13 tests (Vitest + RTL):** wallet-connect lists Freighter and returns an address (wallet **mocked**); no SSR `window` error on first paint; bottom nav switches Home/Earn/Account.
- **e2e (Playwright)** deferred to **U17**.
- **DoD:** `pnpm install` clean · `pnpm -C frontend build` clean (no `window is not defined`) · connect works on a mobile viewport and matches the mock-2 shell · unit tests green · PR uses the `pr-e2e-evidence` template (before/after composite).

## 10. Downstream notes (U14–U16 — NOT U13, capture for later + Axel sync)

**Product model**
- One deposit **hop**: Freighter wallet → vault. The single deposit tx also auto-allocates (earning starts immediately). First-ever deposit additionally signs the one-time **auto-optimize mandate** (consent), not a second money move. Withdraw = vault → wallet. **No idle in-app "cash" tier.**
- `/home` and `/earn` are **two views of the same vault**. Home = *holdings* (balance $, buckets, agent activity). Earn = *yield* (hero = "You're earning $X", balance demoted to context, growth chart, monthly breakdown). Different hero numbers → no redundancy.
- The **mandate** is essential (enables auto-compound/rebalance without signing each move). It is **not** a settings page: signed at first deposit, shown as a "Signed auto-optimize mandate" Activity entry; revoking it ≈ withdrawing (staying-deposited-unmanaged is pointless). → **Wallet & approvals page dropped.** Disconnect = "Log out".

**Multi-currency**
- Per-currency **buckets** (USDC/EURC/CETES…); funds stay native (no conversion, R3/R21). Display aggregates to USD via FX rate; drill-down per currency.
- **Bucket-toggle conditional rule** (Home + Earn-funded + Withdraw picker): 0 buckets → no toggle; 1 bucket → **static** pill (no chevron, not clickable); ≥2 → **interactive** (chevron + click to cycle All / per-currency).

**Earn (U16)**
- **Two states.** *Not-deposited:* "Earn balance $0" + APY pill + **Start earning** + "No lockup, move to your wallet anytime" + Simulate card (header stepper `− $x +`, **currency selector USDC/EURC/CETES**, chart, Day/Week/Month/Year). *Deposited:* "You're earning $X" hero + balance context + bucket toggle + Deposit/Move-to-wallet + Growth card (chart + period + monthly breakdown).
- Simulator **currency selector is plan-aligned** (U11 `simulate(currency, amount, period)`). **No pool chips** (agent picks the best pool — user does not choose the pool; only the currency). USDY not in the selector (RWA = fixed instrument, not a currency).
- **Monthly earnings breakdown (This month / November / October) = NEW backend scope** (earnings-history / NAV snapshots), beyond U11's `simulate()` + `activity()`. **Flag to Axel.**

**Deposit / Withdraw (U14)**
- Both are **full-page keypad** screens (not bottom-sheets): source pill + big amount + keypad + 10%/50%/Max + action button ("Deposit fund" / "Move to wallet"). Deposit source = wallet balance of the currency (chosen by tapping a currency in Add funds). Withdraw source = **bucket picker** pill (conditional chevron per the rule above); Max = full bucket balance.
- **Add funds** list: tag style (small chips for chains/venue), no "Free up to $30k", no "to X bucket". **RWA rows show no APY** (single fixed-yield instruments — rate appears at deposit time), just a tag (Ondo / Bond).
- **Buckets** rows (Home): venue as **tags** (e.g. DeFindex / Vault, Blend / Fixed pool), no "auto compounding" prose.

**Activity (U16, + small backend note)**
- Centralized **Activity page** at `/account/activity`, reached from **Home "View all activity"** and **Account "Activity"** (same route). "Recent activity" removed from Account.
- Filter tabs **All / Yours / Automated** (active tab = `#ECECEC`). Entries: Switched to X, Reinvested rewards, Paused pool (flagged), Proposed safe exit (→ **Review** CTA), Moved to wallet, Deposited, Signed mandate, Allocated. **No auto-compound entries** (ambient/continuous — reflected in growing balance, not the feed). Descriptions = **time only** (3h ago / 1d ago). "Yours" merges user tx history with the agent `activity()` log — small backend note.

**Freeze / exit (U15)**
- **FreezeBanner** on Home/Earn: **amber warning-triangle icon** ("attention" token), copy "Your earning is paused / Tap to review and approve the move" — **no pool name, no "Sentinel", no em dash.** Card stays neutral (no yellow wash).
- **ExitApproval** drawer: visual **From → To** (paused pool → safe pool same currency, amount) with a dark arrow badge; buttons "Approve and sign in wallet" / "Not now". Freeze is automatic (keeper, R9/R10); the exit needs the user's signature (R13). **AFK:** funds stay in the frozen pool (safe), banner + Activity entry persist until the user returns. Push notifications are **not** in the MVP (R14 — activity entries only).

**Account (U16)**
- **Blockies identicon** derived from the wallet address (monochrome), no editable profile photo. Rows: **Activity**, **Auto reinvest rewards** toggle, **Log out** (with a confirm drawer — "Log out?"). Removed: Notifications, Analytics, Legal, the "Not financial advice" disclaimer (revisit compliance later), standalone Account/Security rows.

**Semantic color system**
- green = positive/yield · red = danger/loss · **amber = attention/caution** (freeze). **No risk-tier labels** anywhere (Safe/Watch/Blocked stay removed — STE-7 invariant).

**Copy / misc**
- "Move to wallet" (not "Withdraw"). Settings list-row title/description sizing must match the Activity/Wallet-style rows.

## 11. Invariants (STE-7) — preserved

No risk labels/tiers · no chatbot · no hub/explore catalog · nav = 3 tabs Home/Earn/Account · deposit has no risk-tier control · wallet-connect Freighter-first (not passkey) · primitives are DRY (no per-screen re-styling).

## 12. Governance

`sorosense-mock-2.html` is a **proposal** and edits the UI source of truth. `sorosense-mock-1.html` (owned by Axel, PM) is untouched. Before mock-2 drives U14–U16, **sync with Axel**; the two genuinely-new backend items to raise are: **monthly earnings-history** (Earn Deposited breakdown) and the **Activity "Yours" user-tx merge**. None of this changes U13.
