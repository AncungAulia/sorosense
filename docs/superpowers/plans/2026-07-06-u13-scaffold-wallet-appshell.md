# U13 — Next.js scaffold + wallet-connect + app shell — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a mobile-first Next.js app with Freighter-first wallet-connect and a shared, DRY UI shell (design tokens + primitives + bottom nav), extracted once from `docs/mockups/sorosense-mock-2.html`.

**Architecture:** App Router. A `WalletProvider` (client-only) holds connection state and gates the `(app)` route group. Design tokens live in Tailwind v4 `@theme` (CSS-first) in `app/globals.css`; primitives in `components/ui/` consume them. Screens are placeholders — U14/U16 fill them.

**Tech Stack:** Next.js 16.2.10 (App Router) · React 19.2.4 · Tailwind CSS v4 · TypeScript 5 · Stellar Wallets Kit (`@creit.tech/stellar-wallets-kit`) + `@stellar/freighter-api` · Vitest + React Testing Library · Switzer font (Fontshare, self-hosted via `next/font/local`).

## Global Constraints

- **Monorepo:** pnpm workspace at repo root. Run `pnpm install` at the **root**, never `npm install` in `frontend/`. `frontend` is a workspace member.
- **Read local Next docs first:** This is NOT the Next.js in training data. Before writing any Next-specific code, read the relevant guide in `frontend/node_modules/next/dist/docs/`. Heed deprecations. (`frontend/AGENTS.md`.)
- **KTD7 — client-only wallet:** all wallet code runs inside `"use client"` + `useEffect`, never module scope. No `window is not defined` / hydration errors.
- **Design source of truth:** `docs/mockups/sorosense-mock-2.html`. Match its tokens/primitives exactly.
- **Palette (monochrome + semantic only, no brand color):** `--ink #111316`, `--muted #808080`, `--faint #a6a6a6`, `--bg #F2F2F2`, `--card #F8F8F8`, `--pill #F0F0F0`, `--pill-ink #505050`, `--line #E6E6E6`, `--line-2 #DEDEDE`, `--pos #16a34a`, `--neg #c0453b`, `--warn #b45309`, `--warn-soft #fbf1e2`. Primary action = ink (dark), never a brand color.
- **Type:** Switzer, weights ≤ 600 (400/500/600). Numbers `tabular-nums`.
- **Component vocabulary:** **Button** = dimensional capsule; **Pill/toggle** = flat. Never re-style primitives per screen (DRY).
- **Invariants (STE-7):** 3-tab nav Home/Earn/Account · no risk labels/tiers · no chatbot · no hub/explore catalog · Freighter-first (not passkey).
- **Requirements covered:** R12 (Wallets Kit, Freighter-first, standalone + in-Discover), R13 (signing in wallet), R16 (mobile-first).

---

## File Structure

**Create:**
- `frontend/lib/fonts.ts` — Switzer via `next/font/local`
- `frontend/lib/wallet.ts` — wallet capability module (init, connect, sign, disconnect)
- `frontend/providers/WalletProvider.tsx` — client context
- `frontend/hooks/useWallet.ts` — consumer hook
- `frontend/components/ui/Button.tsx`, `Card.tsx`, `Chip.tsx`, `BottomNav.tsx`, `BottomSheet.tsx`, `Toast.tsx`, `index.ts`
- `frontend/app/(app)/layout.tsx` — shell (BottomNav + auth-gate)
- `frontend/app/(app)/home/page.tsx`, `earn/page.tsx`, `account/page.tsx` — placeholders
- `frontend/vitest.config.ts`, `frontend/vitest.setup.ts`
- test files colocated under `frontend/**/__tests__/` or `*.test.tsx`
- `frontend/public/fonts/` — Switzer `.woff2` files

**Modify:**
- `frontend/package.json` — deps + scripts
- `frontend/app/globals.css` — Tailwind v4 `@theme` tokens
- `frontend/app/layout.tsx` — font + `<WalletProvider>`
- `frontend/app/page.tsx` — onboarding + connect

**Delete:**
- `frontend/src/` (empty scaffold skeleton — we use root `components/`, `lib/`)

---

## Task 1: Workspace reconciliation, deps, read docs

**Files:**
- Modify: `frontend/package.json`
- Delete: `frontend/src/`

**Interfaces:**
- Produces: a clean `pnpm install`; scripts `dev/build/lint/test/typecheck`; wallet + test deps available.

- [ ] **Step 1: Read the Next 16 docs index**

Read `frontend/node_modules/next/dist/docs/` (start at the index/README). Note anything that differs from classic App Router: route groups, `layout.tsx`/`page.tsx` conventions, metadata, `next/font`, client/server component rules. Record deviations in a scratch note; later tasks depend on them.

- [ ] **Step 2: Read the Tailwind v4 setup already in the scaffold**

Read `frontend/app/globals.css` (currently `@import "tailwindcss";`) and `frontend/postcss.config.mjs`. Confirm Tailwind v4 is wired via `@tailwindcss/postcss`. Tokens will be added as `@theme` in Task 2.

- [ ] **Step 3: Delete the empty src skeleton**

```bash
rm -rf frontend/src
```

- [ ] **Step 4: Add dependencies to `frontend/package.json`**

Add to `dependencies`: `@creit.tech/stellar-wallets-kit`, `@stellar/freighter-api`.
Add to `devDependencies`: `vitest`, `@vitejs/plugin-react`, `jsdom`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`.
Add scripts: `"test": "vitest run"`, `"test:watch": "vitest"`, `"typecheck": "tsc --noEmit"`.

- [ ] **Step 5: Install at the repo root**

Run: `pnpm install` (from repo root, not `frontend/`)
Expected: resolves all workspaces; `frontend/node_modules` populated with the new deps. No peer-dep errors that block install.

- [ ] **Step 6: Verify the scaffold still builds**

Run: `pnpm -C frontend build`
Expected: clean build (still the `Hello World` page). If it fails, fix config before proceeding.

- [ ] **Step 7: Commit**

```bash
git add frontend/package.json pnpm-lock.yaml
git commit -m "chore(frontend): workspace deps for wallet + tests, drop src skeleton"
```

---

## Task 2: Design tokens (`@theme`) + Switzer font

**Files:**
- Modify: `frontend/app/globals.css`
- Create: `frontend/lib/fonts.ts`, `frontend/public/fonts/*.woff2`

**Interfaces:**
- Produces: CSS variables + Tailwind utilities for every token in Global Constraints; `switzer` font export.

- [ ] **Step 1: Download Switzer woff2 into `frontend/public/fonts/`**

From Fontshare (Switzer, free-for-commercial ITF license), download weights 400/500/600 as `.woff2` → `frontend/public/fonts/Switzer-Regular.woff2`, `Switzer-Medium.woff2`, `Switzer-Semibold.woff2`.

- [ ] **Step 2: Create `frontend/lib/fonts.ts`**

```ts
import localFont from "next/font/local";

export const switzer = localFont({
  src: [
    { path: "../public/fonts/Switzer-Regular.woff2", weight: "400", style: "normal" },
    { path: "../public/fonts/Switzer-Medium.woff2", weight: "500", style: "normal" },
    { path: "../public/fonts/Switzer-Semibold.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-switzer",
  display: "swap",
});
```

Verify `next/font/local` import path against the local Next docs (Step 1, Task 1).

- [ ] **Step 3: Write tokens into `frontend/app/globals.css`**

```css
@import "tailwindcss";

@theme {
  --color-ink: #111316;
  --color-ink-2: #2b3033;
  --color-muted: #808080;
  --color-faint: #a6a6a6;
  --color-bg: #f2f2f2;
  --color-card: #f8f8f8;
  --color-pill: #f0f0f0;
  --color-pill-ink: #505050;
  --color-line: #e6e6e6;
  --color-line-2: #dedede;
  --color-pos: #16a34a;
  --color-neg: #c0453b;
  --color-warn: #b45309;
  --color-warn-soft: #fbf1e2;

  --radius-card: 22px;
  --radius-sheet: 26px;
  --radius-field: 16px;

  --font-sans: var(--font-switzer), -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}

html, body { height: 100%; }
body { background: var(--color-bg); color: var(--color-ink); font-family: var(--font-sans); -webkit-font-smoothing: antialiased; }
```

Confirm Tailwind v4 `@theme` variable naming (`--color-*`, `--radius-*`, `--font-*`) against the Tailwind v4 docs — v4 derives utilities (`bg-ink`, `rounded-card`) from these names.

- [ ] **Step 4: Smoke-test a token renders**

Temporarily set `frontend/app/page.tsx` body to `<div className="bg-card text-ink rounded-card p-6">token check</div>`, run `pnpm -C frontend dev`, confirm the card color `#F8F8F8` and radius render. Revert the temporary markup.

- [ ] **Step 5: Commit**

```bash
git add frontend/app/globals.css frontend/lib/fonts.ts frontend/public/fonts
git commit -m "feat(ui): design tokens (@theme) + Switzer font"
```

---

## Task 3: `Button` primitive (TDD)

**Files:**
- Create: `frontend/components/ui/Button.tsx`, `frontend/components/ui/__tests__/Button.test.tsx`
- Create: `frontend/vitest.config.ts`, `frontend/vitest.setup.ts` (first test task)

**Interfaces:**
- Produces: `Button` — `props: { variant?: "ink" | "glass"; children; onClick?; type? } & ButtonHTMLAttributes`. `variant` defaults to `"ink"`. Renders a `<button>`.

- [ ] **Step 1: Create Vitest config + setup**

`frontend/vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: { environment: "jsdom", globals: true, setupFiles: ["./vitest.setup.ts"] },
});
```
`frontend/vitest.setup.ts`:
```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 2: Write the failing test**

`frontend/components/ui/__tests__/Button.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "../Button";

test("renders label and fires onClick", async () => {
  const onClick = vi.fn();
  render(<Button onClick={onClick}>Get started</Button>);
  const btn = screen.getByRole("button", { name: "Get started" });
  await userEvent.click(btn);
  expect(onClick).toHaveBeenCalledOnce();
});

test("applies the glass variant class", () => {
  render(<Button variant="glass">Other wallets</Button>);
  expect(screen.getByRole("button", { name: "Other wallets" }).className).toContain("bg-white");
});
```

- [ ] **Step 3: Run test, verify it fails**

Run: `pnpm -C frontend test Button`
Expected: FAIL — cannot resolve `../Button`.

- [ ] **Step 4: Implement `Button.tsx`**

```tsx
import type { ButtonHTMLAttributes } from "react";

type Variant = "ink" | "glass";
const base =
  "flex w-full h-14 items-center justify-center gap-2 rounded-full text-base font-semibold transition-transform active:scale-[.985]";
const variants: Record<Variant, string> = {
  ink: "text-[#f8f8f8] [background:linear-gradient(180deg,#3d3d40,#171719)] [box-shadow:inset_0_1px_0_rgba(255,255,255,.2),inset_0_-9px_16px_-9px_rgba(0,0,0,.6),0_10px_22px_-10px_rgba(0,0,0,.42)]",
  glass: "bg-white text-ink-2 border border-line [box-shadow:inset_0_1px_0_rgba(255,255,255,.85),0_8px_18px_-10px_rgba(0,0,0,.18)]",
};

export function Button({
  variant = "ink",
  className = "",
  ...props
}: { variant?: Variant } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={`${base} ${variants[variant]} ${className}`} {...props} />;
}
```

- [ ] **Step 5: Run test, verify it passes**

Run: `pnpm -C frontend test Button`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add frontend/components/ui/Button.tsx frontend/components/ui/__tests__/Button.test.tsx frontend/vitest.config.ts frontend/vitest.setup.ts
git commit -m "feat(ui): Button primitive + vitest setup"
```

---

## Task 4: `Card` + `Chip` primitives (TDD)

**Files:**
- Create: `frontend/components/ui/Card.tsx`, `frontend/components/ui/Chip.tsx`, tests alongside.

**Interfaces:**
- Produces: `Card` (`props: { className?; children } & HTMLAttributes<HTMLDivElement>`) → `<div>` white-edge + soft shadow. `Chip` (`props: { children; className? }`) → flat pill span.

- [ ] **Step 1: Write failing tests**

`frontend/components/ui/__tests__/Card.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import { Card } from "../Card";
test("renders children inside a card", () => {
  render(<Card>hello</Card>);
  expect(screen.getByText("hello")).toBeInTheDocument();
});
```
`frontend/components/ui/__tests__/Chip.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import { Chip } from "../Chip";
test("renders chip text", () => {
  render(<Chip>Recommended</Chip>);
  expect(screen.getByText("Recommended")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run, verify fail**

Run: `pnpm -C frontend test Card Chip`
Expected: FAIL — modules missing.

- [ ] **Step 3: Implement**

`frontend/components/ui/Card.tsx`:
```tsx
import type { HTMLAttributes } from "react";
export function Card({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`relative rounded-card border border-white bg-card [box-shadow:0_1px_2px_rgba(17,19,22,.03),0_14px_34px_-22px_rgba(17,19,22,.16)] ${className}`}
      {...props}
    />
  );
}
```
`frontend/components/ui/Chip.tsx`:
```tsx
import type { HTMLAttributes } from "react";
export function Chip({ className = "", ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={`inline-flex h-[26px] items-center gap-1.5 rounded-full bg-pill px-[11px] text-xs font-medium text-muted ${className}`}
      {...props}
    />
  );
}
```

- [ ] **Step 4: Run, verify pass**

Run: `pnpm -C frontend test Card Chip`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/components/ui/Card.tsx frontend/components/ui/Chip.tsx frontend/components/ui/__tests__/Card.test.tsx frontend/components/ui/__tests__/Chip.test.tsx
git commit -m "feat(ui): Card + Chip primitives"
```

---

## Task 5: `BottomSheet` + `Toast` primitives (TDD)

**Files:**
- Create: `frontend/components/ui/BottomSheet.tsx`, `frontend/components/ui/Toast.tsx`, tests alongside.

**Interfaces:**
- Produces: `BottomSheet` (`props: { open: boolean; onClose: () => void; children; label?: string }`) → scrim + sheet, hidden when `!open`. `Toast` (`props: { open: boolean; message: string }`) → frosted-glass monochrome toast.

- [ ] **Step 1: Write failing tests**

`frontend/components/ui/__tests__/BottomSheet.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BottomSheet } from "../BottomSheet";
test("shows content when open and closes on scrim click", async () => {
  const onClose = vi.fn();
  render(<BottomSheet open onClose={onClose} label="Deposit"><p>sheet body</p></BottomSheet>);
  expect(screen.getByText("sheet body")).toBeVisible();
  await userEvent.click(screen.getByTestId("scrim"));
  expect(onClose).toHaveBeenCalledOnce();
});
test("is not shown when closed", () => {
  render(<BottomSheet open={false} onClose={() => {}}><p>hidden body</p></BottomSheet>);
  expect(screen.getByTestId("sheet").className).not.toContain("translate-y-0");
});
```
`frontend/components/ui/__tests__/Toast.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import { Toast } from "../Toast";
test("renders the message", () => {
  render(<Toast open message="Deposited. Agent is allocating." />);
  expect(screen.getByText("Deposited. Agent is allocating.")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run, verify fail**

Run: `pnpm -C frontend test BottomSheet Toast`
Expected: FAIL.

- [ ] **Step 3: Implement**

`frontend/components/ui/BottomSheet.tsx`:
```tsx
import type { ReactNode } from "react";
export function BottomSheet({
  open, onClose, children, label,
}: { open: boolean; onClose: () => void; children: ReactNode; label?: string }) {
  return (
    <>
      <div
        data-testid="scrim"
        onClick={onClose}
        className={`absolute inset-0 z-50 bg-black/40 backdrop-blur-[2px] transition-opacity ${open ? "opacity-100" : "pointer-events-none opacity-0"}`}
      />
      <div
        data-testid="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className={`absolute inset-x-0 bottom-0 z-[51] max-h-[90%] overflow-y-auto rounded-t-sheet border-t border-white bg-card px-5 pb-6 pt-2 transition-transform ${open ? "translate-y-0" : "translate-y-full"}`}
      >
        <div className="mx-auto mb-4 mt-1.5 h-[5px] w-10 rounded-full bg-black/10" />
        {children}
      </div>
    </>
  );
}
```
`frontend/components/ui/Toast.tsx`:
```tsx
export function Toast({ open, message }: { open: boolean; message: string }) {
  return (
    <div
      role="status"
      className={`absolute inset-x-5 bottom-[104px] z-[70] flex items-center gap-3 rounded-2xl border border-white/70 bg-white/40 px-4 py-3.5 text-sm font-medium text-ink [backdrop-filter:blur(30px)_saturate(185%)] [box-shadow:0_1px_2px_rgba(17,19,22,.05),0_20px_44px_-18px_rgba(17,19,22,.32)] transition ${open ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0"}`}
    >
      <span className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full bg-ink">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
      </span>
      {message}
    </div>
  );
}
```

- [ ] **Step 4: Run, verify pass**

Run: `pnpm -C frontend test BottomSheet Toast`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/components/ui/BottomSheet.tsx frontend/components/ui/Toast.tsx frontend/components/ui/__tests__/BottomSheet.test.tsx frontend/components/ui/__tests__/Toast.test.tsx
git commit -m "feat(ui): BottomSheet + Toast primitives"
```

---

## Task 6: `BottomNav` primitive + progressive blur + barrel (TDD)

**Files:**
- Create: `frontend/components/ui/BottomNav.tsx`, `frontend/components/ui/__tests__/BottomNav.test.tsx`, `frontend/components/ui/index.ts`

**Interfaces:**
- Consumes: Next `usePathname`, `Link` (from `next/navigation`, `next/link` — verify exact import paths against local Next docs).
- Produces: `BottomNav` — renders 3 links (Home `/home`, Earn `/earn`, Account `/account`); the one matching `usePathname()` gets `aria-current="page"`. `index.ts` re-exports all primitives.

- [ ] **Step 1: Write the failing test (mock `usePathname`)**

`frontend/components/ui/__tests__/BottomNav.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import { BottomNav } from "../BottomNav";

vi.mock("next/navigation", () => ({ usePathname: () => "/earn" }));
vi.mock("next/link", () => ({ default: ({ href, children, ...p }: any) => <a href={href} {...p}>{children}</a> }));

test("marks the active tab by pathname", () => {
  render(<BottomNav />);
  expect(screen.getByRole("link", { name: /Earn/ })).toHaveAttribute("aria-current", "page");
  expect(screen.getByRole("link", { name: /Home/ })).not.toHaveAttribute("aria-current");
});
```

- [ ] **Step 2: Run, verify fail**

Run: `pnpm -C frontend test BottomNav`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `BottomNav.tsx`**

```tsx
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const TABS = [
  { href: "/home", label: "Home", icon: <path d="M4 11l8-7 8 7M6 10v9h12v-9" /> },
  { href: "/earn", label: "Earn", icon: <path d="M4 20V4M4 20h16" /> },
  { href: "/account", label: "Account", icon: <><circle cx="12" cy="8" r="4" /><path d="M4 20a8 8 0 0 1 16 0" /></> },
] as const;

function Icon({ children }: { children: ReactNode }) {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">{children}</svg>;
}

export function BottomNav() {
  const path = usePathname();
  return (
    <>
      {/* progressive blur overlay above the nav */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 z-[38] h-[104px] overflow-hidden rounded-b-[37px]">
        <div className="absolute inset-0 [backdrop-filter:blur(2px)] [mask-image:linear-gradient(to_top,#000_0%,#000_52%,transparent_100%)]" />
        <div className="absolute inset-0 [backdrop-filter:blur(5px)] [mask-image:linear-gradient(to_top,#000_0%,#000_30%,transparent_58%)]" />
        <div className="absolute inset-0 [backdrop-filter:blur(9px)] [mask-image:linear-gradient(to_top,#000_0%,#000_15%,transparent_36%)]" />
        <div className="absolute inset-0 [background:linear-gradient(180deg,transparent,rgba(242,242,242,.5))]" />
      </div>
      <nav aria-label="Main" className="absolute inset-x-0 bottom-0 z-40 flex h-[88px] items-start justify-around px-6 pt-2.5 pb-[calc(20px+env(safe-area-inset-bottom))]">
        {TABS.map((t) => {
          const active = path === t.href;
          return (
            <Link key={t.href} href={t.href} aria-current={active ? "page" : undefined}
              className={`flex h-[52px] flex-col items-center justify-center gap-[3px] rounded-[18px] border border-transparent px-[18px] text-[11px] font-medium ${active ? "border-white bg-card text-ink [box-shadow:0_1px_2px_rgba(17,19,22,.04),0_8px_18px_-10px_rgba(17,19,22,.18)]" : "text-faint"}`}>
              <Icon>{t.icon}</Icon>{t.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
```

Verify `usePathname` / `Link` import paths against the local Next docs.

- [ ] **Step 4: Run, verify pass**

Run: `pnpm -C frontend test BottomNav`
Expected: PASS.

- [ ] **Step 5: Create the barrel `frontend/components/ui/index.ts`**

```ts
export { Button } from "./Button";
export { Card } from "./Card";
export { Chip } from "./Chip";
export { BottomSheet } from "./BottomSheet";
export { Toast } from "./Toast";
export { BottomNav } from "./BottomNav";
```

- [ ] **Step 6: Commit**

```bash
git add frontend/components/ui/BottomNav.tsx frontend/components/ui/index.ts frontend/components/ui/__tests__/BottomNav.test.tsx
git commit -m "feat(ui): BottomNav + progressive blur + barrel"
```

---

## Task 7: Wallet capability module `lib/wallet.ts` (TDD)

**Files:**
- Create: `frontend/lib/wallet.ts`, `frontend/lib/__tests__/wallet.test.ts`

**Interfaces:**
- Produces:
  - `getKit(): StellarWalletsKit` — lazy singleton, created only in the browser.
  - `connect(): Promise<string>` — opens Freighter-first selection, returns the address.
  - `getAddress(): Promise<string>`
  - `signTransaction(xdr: string): Promise<string>` — returns signed XDR.
  - `disconnect(): Promise<void>`
- Consumes: `@creit.tech/stellar-wallets-kit` (`StellarWalletsKit`, modules, `FREIGHTER_ID`, network enum) — **verify exact export names/signatures against `node_modules/@creit.tech/stellar-wallets-kit` and stellarwalletskit.dev**; the code below is the expected shape.

- [ ] **Step 1: Write the failing test with the kit mocked**

`frontend/lib/__tests__/wallet.test.ts`:
```ts
const setWallet = vi.fn();
const openModal = vi.fn(async ({ onWalletSelected }: any) => onWalletSelected({ id: "freighter" }));
const getAddress = vi.fn(async () => ({ address: "GABC123" }));
vi.mock("@creit.tech/stellar-wallets-kit", () => ({
  StellarWalletsKit: vi.fn().mockImplementation(() => ({ setWallet, openModal, getAddress, signTransaction: vi.fn() })),
  WalletNetwork: { TESTNET: "TESTNET" },
  FREIGHTER_ID: "freighter",
  allowAllModules: () => [],
}));

test("connect() returns the selected wallet address", async () => {
  const { connect } = await import("../wallet");
  await expect(connect()).resolves.toBe("GABC123");
});
```

- [ ] **Step 2: Run, verify fail**

Run: `pnpm -C frontend test wallet`
Expected: FAIL — `../wallet` missing.

- [ ] **Step 3: Implement `lib/wallet.ts`**

```ts
import {
  StellarWalletsKit, WalletNetwork, FREIGHTER_ID, allowAllModules,
} from "@creit.tech/stellar-wallets-kit";

let kit: StellarWalletsKit | null = null;

export function getKit(): StellarWalletsKit {
  if (typeof window === "undefined") throw new Error("wallet is client-only");
  if (!kit) {
    kit = new StellarWalletsKit({
      network: WalletNetwork.TESTNET,
      selectedWalletId: FREIGHTER_ID, // Freighter-first
      modules: allowAllModules(),     // xBull / Lobstr / WalletConnect fallback
    });
  }
  return kit;
}

export async function connect(): Promise<string> {
  const k = getKit();
  let picked = FREIGHTER_ID;
  await k.openModal({ onWalletSelected: (w) => { picked = w.id; } });
  k.setWallet(picked);
  const { address } = await k.getAddress();
  return address;
}

export async function getAddress(): Promise<string> {
  return (await getKit().getAddress()).address;
}

export async function signTransaction(xdr: string): Promise<string> {
  const { signedTxXdr } = await getKit().signTransaction(xdr, { networkPassphrase: WalletNetwork.TESTNET });
  return signedTxXdr;
}

export async function disconnect(): Promise<void> {
  await getKit().disconnect?.();
  kit = null;
}
```

Reconcile method names (`openModal`, `getAddress`, `signTransaction`, `setWallet`, `disconnect`) with the installed Wallets Kit version before finalizing.

- [ ] **Step 4: Run, verify pass**

Run: `pnpm -C frontend test wallet`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/wallet.ts frontend/lib/__tests__/wallet.test.ts
git commit -m "feat(wallet): Freighter-first Stellar Wallets Kit capability layer"
```

---

## Task 8: `WalletProvider` + `useWallet` (TDD)

**Files:**
- Create: `frontend/providers/WalletProvider.tsx`, `frontend/hooks/useWallet.ts`, `frontend/providers/__tests__/WalletProvider.test.tsx`

**Interfaces:**
- Consumes: `connect`, `disconnect`, `signTransaction` from `lib/wallet`.
- Produces: `WalletProvider` (client, wraps app). `useWallet(): { address: string | null; isConnected: boolean; connect(): Promise<void>; disconnect(): Promise<void>; signTransaction(xdr: string): Promise<string> }`. Persists `address` in `localStorage` key `"soro.wallet"`.

- [ ] **Step 1: Write the failing test (mock `lib/wallet`)**

`frontend/providers/__tests__/WalletProvider.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WalletProvider } from "../WalletProvider";
import { useWallet } from "../../hooks/useWallet";

vi.mock("../../lib/wallet", () => ({
  connect: vi.fn(async () => "GABC123"),
  disconnect: vi.fn(async () => {}),
  signTransaction: vi.fn(async () => "SIGNED"),
}));

function Probe() {
  const { address, isConnected, connect } = useWallet();
  return (
    <div>
      <span data-testid="addr">{address ?? "none"}</span>
      <span data-testid="flag">{String(isConnected)}</span>
      <button onClick={() => connect()}>connect</button>
    </div>
  );
}

test("connect sets address + isConnected", async () => {
  render(<WalletProvider><Probe /></WalletProvider>);
  expect(screen.getByTestId("flag").textContent).toBe("false");
  await userEvent.click(screen.getByRole("button", { name: "connect" }));
  expect(await screen.findByText("GABC123")).toBeInTheDocument();
  expect(screen.getByTestId("flag").textContent).toBe("true");
});
```

- [ ] **Step 2: Run, verify fail**

Run: `pnpm -C frontend test WalletProvider`
Expected: FAIL — modules missing.

- [ ] **Step 3: Implement provider + hook**

`frontend/providers/WalletProvider.tsx`:
```tsx
"use client";
import { createContext, useCallback, useEffect, useState, type ReactNode } from "react";
import * as wallet from "../lib/wallet";

type Ctx = {
  address: string | null;
  isConnected: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  signTransaction: (xdr: string) => Promise<string>;
};
export const WalletContext = createContext<Ctx | null>(null);
const KEY = "soro.wallet";

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem(KEY);
    if (saved) setAddress(saved);
  }, []);

  const connect = useCallback(async () => {
    const addr = await wallet.connect();
    setAddress(addr);
    window.localStorage.setItem(KEY, addr);
  }, []);

  const disconnect = useCallback(async () => {
    await wallet.disconnect();
    setAddress(null);
    window.localStorage.removeItem(KEY);
  }, []);

  return (
    <WalletContext.Provider value={{ address, isConnected: !!address, connect, disconnect, signTransaction: wallet.signTransaction }}>
      {children}
    </WalletContext.Provider>
  );
}
```
`frontend/hooks/useWallet.ts`:
```ts
"use client";
import { useContext } from "react";
import { WalletContext } from "../providers/WalletProvider";

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within <WalletProvider>");
  return ctx;
}
```

- [ ] **Step 4: Run, verify pass**

Run: `pnpm -C frontend test WalletProvider`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/providers/WalletProvider.tsx frontend/hooks/useWallet.ts frontend/providers/__tests__/WalletProvider.test.tsx
git commit -m "feat(wallet): WalletProvider + useWallet with localStorage persistence"
```

---

## Task 9: Root layout + landing (onboarding + connect)

**Files:**
- Modify: `frontend/app/layout.tsx`, `frontend/app/page.tsx`

**Interfaces:**
- Consumes: `switzer` (fonts), `WalletProvider`, `useWallet`, `Button`, `Chip`.
- Produces: `/` renders onboarding hero + "Connect your wallet"; connect calls `useWallet().connect()` then routes to `/home`.

- [ ] **Step 1: Wire the root layout**

`frontend/app/layout.tsx`:
```tsx
import "./globals.css";
import type { ReactNode } from "react";
import { switzer } from "../lib/fonts";
import { WalletProvider } from "../providers/WalletProvider";

export const metadata = { title: "SoroSense" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={switzer.variable}>
      <body>
        <WalletProvider>{children}</WalletProvider>
      </body>
    </html>
  );
}
```
Confirm `metadata`/`viewport` conventions against the local Next docs (viewport may need a separate `export const viewport`).

- [ ] **Step 2: Write the landing page**

`frontend/app/page.tsx`:
```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "../hooks/useWallet";
import { Button, Chip } from "../components/ui";

export default function Landing() {
  const router = useRouter();
  const { connect } = useWallet();
  const [signin, setSignin] = useState(false);

  async function onConnect() {
    await connect();
    router.push("/home");
  }

  if (!signin) {
    return (
      <main className="flex min-h-dvh flex-col justify-between px-7 pb-10 pt-24 text-center">
        <div className="text-lg font-semibold">SoroSense</div>
        <div>
          <h1 className="text-[34px] font-semibold leading-[1.06] tracking-[-.02em]">Stablecoin yield,<br />guarded around<br />the clock.</h1>
          <p className="mx-4 mt-4 text-base text-muted">Deposit, and the agent puts your money in the safest yield across Stellar and keeps it out of harm's way, automatically.</p>
        </div>
        <div className="grid gap-3">
          <Button onClick={() => setSignin(true)}>Get started</Button>
          <Button variant="glass" onClick={() => setSignin(true)}>I already have an account</Button>
        </div>
      </main>
    );
  }
  return (
    <main className="flex min-h-dvh flex-col justify-between px-7 pb-10 pt-24 text-center">
      <div>
        <h1 className="text-2xl font-semibold">Connect your wallet</h1>
        <p className="mt-3 text-sm text-muted">Choose a Stellar wallet to continue</p>
      </div>
      <div className="grid gap-3">
        <Button variant="glass" onClick={onConnect}>Connect Freighter<Chip className="ml-auto">Recommended</Chip></Button>
        <Button variant="glass" onClick={onConnect}>Other wallets</Button>
        <p className="mt-1 text-xs text-faint">Non-custodial, you keep your keys. Testnet demo.</p>
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Verify no SSR `window` error + connect routes**

Run: `pnpm -C frontend build`
Expected: clean build, no `window is not defined`.
Run: `pnpm -C frontend dev`, open the app on a mobile viewport (390px). Click Get started → Connect Freighter → the (mocked/real) Freighter flow runs and the app navigates to `/home`.

- [ ] **Step 4: Commit**

```bash
git add frontend/app/layout.tsx frontend/app/page.tsx
git commit -m "feat(app): root layout + onboarding/connect landing"
```

---

## Task 10: `(app)` shell + placeholders + auth-gate (TDD)

**Files:**
- Create: `frontend/app/(app)/layout.tsx`, `frontend/app/(app)/home/page.tsx`, `frontend/app/(app)/earn/page.tsx`, `frontend/app/(app)/account/page.tsx`
- Create: `frontend/app/(app)/__tests__/shell.test.tsx`

**Interfaces:**
- Consumes: `useWallet`, `BottomNav`.
- Produces: `(app)` layout renders `<BottomNav>` + children; redirects to `/` when `!isConnected`. Three placeholder pages titled Home / Earn / Account.

- [ ] **Step 1: Write the failing shell test**

`frontend/app/(app)/__tests__/shell.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import AppLayout from "../layout";

const push = vi.fn();
vi.mock("next/navigation", () => ({ usePathname: () => "/home", useRouter: () => ({ push }) }));
vi.mock("next/link", () => ({ default: ({ href, children, ...p }: any) => <a href={href} {...p}>{children}</a> }));
const useWallet = vi.fn();
vi.mock("../../../hooks/useWallet", () => ({ useWallet: () => useWallet() }));

test("renders nav + children when connected", () => {
  useWallet.mockReturnValue({ isConnected: true });
  render(<AppLayout><p>home body</p></AppLayout>);
  expect(screen.getByText("home body")).toBeInTheDocument();
  expect(screen.getByRole("navigation", { name: "Main" })).toBeInTheDocument();
});

test("redirects to / when not connected", () => {
  useWallet.mockReturnValue({ isConnected: false });
  render(<AppLayout><p>home body</p></AppLayout>);
  expect(push).toHaveBeenCalledWith("/");
});
```

- [ ] **Step 2: Run, verify fail**

Run: `pnpm -C frontend test shell`
Expected: FAIL — layout missing.

- [ ] **Step 3: Implement the shell + placeholders**

`frontend/app/(app)/layout.tsx`:
```tsx
"use client";
import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "../../hooks/useWallet";
import { BottomNav } from "../../components/ui";

export default function AppLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { isConnected } = useWallet();

  useEffect(() => {
    if (!isConnected) router.push("/");
  }, [isConnected, router]);

  return (
    <div className="relative min-h-dvh">
      <div className="px-5 pb-[120px] pt-2">{children}</div>
      <BottomNav />
    </div>
  );
}
```
`frontend/app/(app)/home/page.tsx`:
```tsx
export default function HomePage() {
  return <h1 className="pt-8 text-2xl font-semibold">Home</h1>;
}
```
`frontend/app/(app)/earn/page.tsx`:
```tsx
export default function EarnPage() {
  return <h1 className="pt-8 text-2xl font-semibold">Earn</h1>;
}
```
`frontend/app/(app)/account/page.tsx`:
```tsx
export default function AccountPage() {
  return <h1 className="pt-8 text-2xl font-semibold">Account</h1>;
}
```

Confirm route-group `(app)` behavior against the local Next docs.

- [ ] **Step 4: Run, verify pass**

Run: `pnpm -C frontend test shell`
Expected: PASS.

- [ ] **Step 5: Manual nav check**

Run: `pnpm -C frontend dev`. Connect → land on `/home`. Tap Earn / Account in the bottom nav → routes change, active tab highlights, `WalletProvider` state persists (no reconnect prompt).

- [ ] **Step 6: Commit**

```bash
git add "frontend/app/(app)"
git commit -m "feat(app): (app) shell + bottom nav + auth-gate + placeholder tabs"
```

---

## Task 11: Full verification + PR evidence

**Files:** none (verification + docs).

- [ ] **Step 1: Full test + typecheck + build**

Run: `pnpm -C frontend test && pnpm -C frontend typecheck && pnpm -C frontend build`
Expected: all green; no `window is not defined`; no TS errors.

- [ ] **Step 2: Mobile-viewport dogfood against the mockup**

Run `pnpm -C frontend dev`, DevTools device mode at 390px. Verify: onboarding → connect → `/home`; bottom-nav switches Home/Earn/Account; the shell (tokens, Button/Card, nav + progressive blur, Toast if surfaced) matches `docs/mockups/sorosense-mock-2.html`. Capture before/after screenshots.

- [ ] **Step 3: Draft PR evidence (pr-e2e-evidence template)**

Write `docs/tests/linear-STE-23/e2e-evidence.md` per the `pr-e2e-evidence` skill: environment (branch, commit, local URL), before/after composite (annotated), verified behavior, console/network notes.

- [ ] **Step 4: Open the PR**

Use the `pr-e2e-evidence` PR template into the parent, with the before/after composite rendered (not `Uploading…`) and the checklist: matches mock-2 · no risk labels/tiers/chatbot/hub · unit tests pass · before/after is one annotated composite.

---

## Self-Review notes

- **Spec coverage:** tokens (Task 2), Button/Pill/Card/Chip/BottomNav/BottomSheet/Toast primitives (Tasks 3–6), wallet layer + provider + hook (Tasks 7–8), routing skeleton + auth-gate (Tasks 9–10), pnpm reconciliation + delete src (Task 1), tests throughout, verification + PR (Task 11). Downstream (U14–U16) content is intentionally out of scope per the spec.
- **Post-cutoff APIs:** Next 16 (route groups, `next/font/local`, `usePathname`/`useRouter`, `metadata`/`viewport`), Tailwind v4 `@theme`, and Stellar Wallets Kit method names are flagged for verification against local docs where used — this is required by `frontend/AGENTS.md`, not a placeholder.
- **Type consistency:** `useWallet()` shape (`address`, `isConnected`, `connect`, `disconnect`, `signTransaction`) is defined in Task 8 and consumed identically in Tasks 9–10. `Button` `variant` (`"ink" | "glass"`) consistent across Tasks 3, 9. `wallet` module exports (`connect`, `disconnect`, `signTransaction`) consistent across Tasks 7–8.
