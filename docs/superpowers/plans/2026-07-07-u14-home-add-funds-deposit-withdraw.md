# U14 — Home + Add funds + Deposit + Withdraw Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the core deposit-to-earn surfaces from `docs/mockups/sorosense-mock-2.html` — Home, Add funds, Deposit (full-page keypad + consent), Withdraw (bucket picker) — against the mock vault seam, with a data layer that swaps to the real backend in one file later.

**Architecture:** Next.js App Router with two route groups sharing one auth gate — `(app)` (tabbed shell + `BottomNav`) and `(flow)` (full-page back-header screens). A single `MockVaultClient` singleton in a `VaultProvider` holds live shares/NAV; frontend fixtures supply display-only venue/APY/activity mirroring the backend's `CatalogEntry`/`ActivityEntry` shapes. Deposit/Withdraw share one `Keypad` primitive; the depositor signs mock transactions through a `Signer` adapter wrapping U13's `wallet.signTransaction`.

**Tech Stack:** Next 16.2.10, React 19, Tailwind v4, TypeScript (strict, `noUncheckedIndexedAccess`), Vitest 2 + `@testing-library/react` (globals on, jsdom), `@sorosense/vault-client` (workspace).

## Global Constraints

- **Design source of truth:** `docs/mockups/sorosense-mock-2.html`. Match markup/classes to it; design tokens already live in `frontend/app/globals.css` (`bg`, `card`, `ink`, `muted`, `faint`, `pos`, `neg`, `warn`, `warn-soft`, `pill`, `line`, radii `card`/`sheet`/`field`).
- **No risk label/tier/score on any surface.** No `risk`/`label`/`score` field on any data shape.
- **Per-currency buckets, never converted.** "All buckets" USD total is a display-only blend via a fixture FX rate. Deposit copy: “Goes to your X bucket. No conversion.”
- **No chatbot, no hub/explore catalog.** Add funds shows only fundable stablecoins (R19).
- **Consent is one-time, no tier** (KTD3).
- **Reuse U13 primitives; never re-style a primitive per screen** (DRY). Primitives: `Button` (ink/glass), `Card`, `Chip`, `BottomSheet`, `Toast`, `BottomNav` in `frontend/components/ui`.
- **Wallet code is client-only** (`"use client"` + effects), never module scope (KTD7).
- **Keeper signing never on the client.** Only depositor writes here.
- **Next 16 is not the training-data Next.** Read `node_modules/next/dist/docs/` before writing route/layout code (AGENTS.md).
- **Typecheck is a hard gate:** run `pnpm -C frontend typecheck` as well as `pnpm -C frontend test`. Indexed access is `T | undefined` — guard it.
- **Test style:** globals are on — use `test`/`expect`/`vi` without importing. Mock `next/navigation` and `next/link` as in `app/(app)/__tests__/shell.test.tsx`.
- Amounts/shares/prices are `bigint`. Stablecoin base unit = `10_000_000n` (7 dp). Share price scaled by `SHARE_PRICE_SCALE` (`1_000_000_000n`) from the seam.

---

## File structure

```
frontend/
  package.json                         # + @sorosense/vault-client (workspace:*)
  lib/vault/
    units.ts                           # toAmount/fromAmount/formatCurrency + UNIT
    signer.ts                          # depositorSigner(address, signTransaction)
    data.ts                            # fixtures: stablecoins, bucket meta, activity, FX, wallet balances
    seed.ts                            # seedVault(client, address) — dev-only funded state
  providers/
    VaultProvider.tsx                  # MockVaultClient singleton + seed-on-connect context
  hooks/
    useVault.ts                        # client + fixtures from context
    useBuckets.ts                      # seam reads + meta → BucketView[] {loading,error,data}
    useActivity.ts                     # fixtures → ActivityItem[]
  components/
    AuthGate.tsx                       # extracted redirect gate (used by both group layouts)
    ui/Keypad.tsx                      # shared amount keypad
    bucket/BucketRow.tsx
    home/FreezeBanner.tsx
    home/TotalHero.tsx                 # hero + bucket toggle
    activity/ActivityRow.tsx
    activity/ActivityList.tsx
    deposit/AddFunds.tsx
    deposit/DepositKeypad.tsx
    deposit/ConsentSheet.tsx
    withdraw/WithdrawKeypad.tsx
  app/
    (app)/layout.tsx                   # uses <AuthGate> + BottomNav (refactor)
    (app)/home/page.tsx                # compose Home
    (app)/earn/page.tsx               # minimal funded stub (withdraw entry)
    (flow)/layout.tsx                  # <AuthGate> + back-header chrome, no nav
    (flow)/add-funds/page.tsx
    (flow)/deposit/[sym]/page.tsx
    (flow)/withdraw/page.tsx
    (flow)/account/activity/page.tsx
```

Root wiring: `VaultProvider` wraps the app under `WalletProvider` (find where `WalletProvider` is mounted — `app/layout.tsx` — and nest `VaultProvider` inside it).

---

## Task 1: Wire the vault seam — dependency + units

**Files:**
- Modify: `frontend/package.json` (add dependency)
- Create: `frontend/lib/vault/units.ts`
- Test: `frontend/lib/vault/__tests__/units.test.ts`

**Interfaces:**
- Produces:
  - `UNIT: bigint` (= `10_000_000n`)
  - `toAmount(decimal: string): bigint` — parse a decimal string to base units (floor, ignores commas)
  - `fromAmount(a: bigint): string` — base units → plain decimal string, 2 dp
  - `formatCurrency(a: bigint, currency: Currency): string` — e.g. `"$1,024.30"` / `"€920.10"`; symbol map USD `$`, EUR `€`, MXN `$`

- [ ] **Step 1: Add the workspace dependency**

Edit `frontend/package.json` `dependencies` (keep alphabetical-ish, after `@stellar/freighter-api`):

```json
    "@sorosense/vault-client": "workspace:*",
```

- [ ] **Step 2: Install**

Run: `pnpm install` (repo root)
Expected: adds `@sorosense/vault-client` link; no errors.

- [ ] **Step 3: Write the failing test**

Create `frontend/lib/vault/__tests__/units.test.ts`:

```ts
import { UNIT, toAmount, fromAmount, formatCurrency } from "../units";

test("toAmount parses decimals to base units and floors", () => {
  expect(toAmount("1024.30")).toBe(10_243_000_000n);
  expect(toAmount("1,024.30")).toBe(10_243_000_000n);
  expect(toAmount("0")).toBe(0n);
  expect(toAmount("0.00000009")).toBe(0n); // below 1 base unit → floors to 0
  expect(UNIT).toBe(10_000_000n);
});

test("fromAmount renders base units as a 2dp string", () => {
  expect(fromAmount(10_243_000_000n)).toBe("1024.30");
  expect(fromAmount(0n)).toBe("0.00");
});

test("formatCurrency adds the currency symbol and grouping", () => {
  expect(formatCurrency(10_243_000_000n, "USD")).toBe("$1,024.30");
  expect(formatCurrency(9_201_000_000n, "EUR")).toBe("€920.10");
});
```

- [ ] **Step 4: Run it, verify it fails**

Run: `pnpm -C frontend test lib/vault/__tests__/units.test.ts`
Expected: FAIL — cannot resolve `../units`.

- [ ] **Step 5: Implement**

Create `frontend/lib/vault/units.ts`:

```ts
import type { Amount, Currency } from "@sorosense/vault-client";

/** Stablecoin base unit (7 decimals), mirroring Stellar stroops-scale assets. */
export const UNIT = 10_000_000n;

const SYMBOL: Record<Currency, string> = { USD: "$", EUR: "€", MXN: "$" };

/** Parse a user-entered decimal (commas allowed) into base units, flooring sub-unit dust. */
export function toAmount(decimal: string): Amount {
  const cleaned = decimal.replace(/,/g, "").trim();
  if (!cleaned || cleaned === ".") return 0n;
  const [whole = "0", frac = ""] = cleaned.split(".");
  const fracPadded = (frac + "0000000").slice(0, 7);
  return BigInt(whole) * UNIT + BigInt(fracPadded || "0");
}

/** Base units → a plain 2dp decimal string (no symbol, no grouping). */
export function fromAmount(a: Amount): string {
  const whole = a / UNIT;
  const frac = (a % UNIT).toString().padStart(7, "0").slice(0, 2);
  return `${whole}.${frac}`;
}

/** Base units → a grouped, symbol-prefixed display string for a currency. */
export function formatCurrency(a: Amount, currency: Currency): string {
  const [whole = "0", frac = "00"] = fromAmount(a).split(".");
  const grouped = Number(whole).toLocaleString("en-US");
  return `${SYMBOL[currency]}${grouped}.${frac}`;
}
```

- [ ] **Step 6: Run tests, verify pass + typecheck**

Run: `pnpm -C frontend test lib/vault/__tests__/units.test.ts && pnpm -C frontend typecheck`
Expected: PASS; typecheck clean.

- [ ] **Step 7: Commit**

```bash
git add frontend/package.json frontend/lib/vault/units.ts frontend/lib/vault/__tests__/units.test.ts pnpm-lock.yaml
git commit -m "feat(U14): add vault-client dep + amount units (STE-24)"
```

---

## Task 2: Signer adapter

**Files:**
- Create: `frontend/lib/vault/signer.ts`
- Test: `frontend/lib/vault/__tests__/signer.test.ts`

**Interfaces:**
- Consumes: `Signer` from `@sorosense/vault-client`; a `signTransaction(xdr: string): Promise<string>` (from `useWallet`).
- Produces: `depositorSigner(address: string, signTransaction: (xdr: string) => Promise<string>): Signer` — role `'depositor'`.

- [ ] **Step 1: Write the failing test**

Create `frontend/lib/vault/__tests__/signer.test.ts`:

```ts
import { depositorSigner } from "../signer";

test("depositorSigner has the depositor role and delegates signing", async () => {
  const sign = vi.fn(async (xdr: string) => `signed:${xdr}`);
  const s = depositorSigner("GDEPOSITOR", sign);
  expect(s.role).toBe("depositor");
  expect(s.address).toBe("GDEPOSITOR");
  await expect(s.sign("mock-xdr-1")).resolves.toBe("signed:mock-xdr-1");
  expect(sign).toHaveBeenCalledWith("mock-xdr-1");
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `pnpm -C frontend test lib/vault/__tests__/signer.test.ts`
Expected: FAIL — cannot resolve `../signer`.

- [ ] **Step 3: Implement**

Create `frontend/lib/vault/signer.ts`:

```ts
import type { Signer } from "@sorosense/vault-client";

/** Bridge the wallet's XDR signer (U13) to the vault seam's depositor Signer. */
export function depositorSigner(
  address: string,
  signTransaction: (xdr: string) => Promise<string>,
): Signer {
  return { role: "depositor", address, sign: (xdr) => signTransaction(xdr) };
}
```

- [ ] **Step 4: Run + typecheck**

Run: `pnpm -C frontend test lib/vault/__tests__/signer.test.ts && pnpm -C frontend typecheck`
Expected: PASS; clean.

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/vault/signer.ts frontend/lib/vault/__tests__/signer.test.ts
git commit -m "feat(U14): depositor Signer adapter over wallet.signTransaction (STE-24)"
```

---

## Task 3: Fixture data (venue/APY/activity/FX/wallet)

**Files:**
- Create: `frontend/lib/vault/data.ts`
- Test: `frontend/lib/vault/__tests__/data.test.ts`

**Interfaces:**
- Produces (types + functions):

```ts
export type StablecoinSym = "USDC" | "EURC" | "CETES";
export interface Stablecoin { sym: StablecoinSym; currency: Currency; chains: string[]; }
export interface BucketMeta { currency: Currency; name: string; venue: string; tags: string[]; apy: number; }
export interface ActivityItem { id: number; cat: "you" | "auto"; kind: string; detail: string; when: string; flag?: boolean; review?: boolean; }
export const STABLECOINS: readonly Stablecoin[];
export function stablecoinBySym(sym: string): Stablecoin | undefined;
export function getBucketMeta(currency: Currency): BucketMeta;
export function getActivity(): ActivityItem[];
export function getFxRateToUsd(currency: Currency): number;   // USD=1
export function getWalletBalance(sym: StablecoinSym): bigint; // base units, for % quick-fill
```

Figures mirror `backend/src/tools/catalog.ts` and `backend/src/api/activity.ts`. `cat`/`when`/`flag`/`review` are presentation facets the backend feed lacks; the later swap maps `ActivityEntry → ActivityItem`.

- [ ] **Step 1: Write the failing test**

Create `frontend/lib/vault/__tests__/data.test.ts`:

```ts
import { STABLECOINS, stablecoinBySym, getBucketMeta, getActivity, getFxRateToUsd, getWalletBalance } from "../data";

test("only fundable stablecoins are listed (R19), one per currency", () => {
  expect(STABLECOINS.map((s) => s.sym)).toEqual(["USDC", "EURC", "CETES"]);
  expect(STABLECOINS.map((s) => s.currency)).toEqual(["USD", "EUR", "MXN"]);
});

test("bucket meta carries venue/apy/tags but no risk field", () => {
  const usd = getBucketMeta("USD");
  expect(usd.name).toBe("USD bucket");
  expect(usd.venue).toBe("DeFindex");
  expect(usd.apy).toBeGreaterThan(0);
  expect(Object.keys(usd)).not.toContain("risk");
  expect(Object.keys(usd)).not.toContain("tier");
});

test("activity has you/auto facets and no risk labels", () => {
  const items = getActivity();
  expect(items.length).toBeGreaterThan(0);
  expect(items.some((a) => a.cat === "you")).toBe(true);
  expect(items.some((a) => a.cat === "auto")).toBe(true);
  for (const a of items) expect(JSON.stringify(a)).not.toMatch(/risk|tier|score/i);
});

test("FX and wallet fixtures are usable", () => {
  expect(getFxRateToUsd("USD")).toBe(1);
  expect(getFxRateToUsd("EUR")).toBeGreaterThan(1);
  expect(getWalletBalance("USDC")).toBeGreaterThan(0n);
  expect(stablecoinBySym("usdc")?.currency).toBe("USD");
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `pnpm -C frontend test lib/vault/__tests__/data.test.ts`
Expected: FAIL — cannot resolve `../data`.

- [ ] **Step 3: Implement**

Create `frontend/lib/vault/data.ts`:

```ts
import type { Currency } from "@sorosense/vault-client";
import { UNIT } from "./units";

export type StablecoinSym = "USDC" | "EURC" | "CETES";
export interface Stablecoin { sym: StablecoinSym; currency: Currency; chains: string[]; }
export interface BucketMeta { currency: Currency; name: string; venue: string; tags: string[]; apy: number; }
export interface ActivityItem {
  id: number; cat: "you" | "auto"; kind: string; detail: string; when: string; flag?: boolean; review?: boolean;
}

/** Fundable stablecoins only — no explore/RWA catalog (R19). */
export const STABLECOINS: readonly Stablecoin[] = [
  { sym: "USDC", currency: "USD", chains: ["Stellar"] },
  { sym: "EURC", currency: "EUR", chains: ["Stellar"] },
  { sym: "CETES", currency: "MXN", chains: ["Stellar", "Solana"] },
];

export function stablecoinBySym(sym: string): Stablecoin | undefined {
  return STABLECOINS.find((s) => s.sym === sym.toUpperCase());
}

/** Venue/APY/tags per bucket — figures mirror backend catalog (getCatalog). No risk field. */
const BUCKET_META: Record<Currency, BucketMeta> = {
  USD: { currency: "USD", name: "USD bucket", venue: "DeFindex", tags: ["DeFindex", "Vault"], apy: 8.59 },
  EUR: { currency: "EUR", name: "EUR bucket", venue: "Blend", tags: ["Blend", "Fixed pool"], apy: 5.1 },
  MXN: { currency: "MXN", name: "MXN bucket", venue: "Etherfuse", tags: ["Etherfuse", "CETES"], apy: 5.57 },
};
export function getBucketMeta(currency: Currency): BucketMeta {
  return BUCKET_META[currency];
}

/** Agent + user activity feed — detail strings mirror ActivityEntry.detail (no risk label). */
export function getActivity(): ActivityItem[] {
  return [
    { id: 8, cat: "auto", kind: "rebalanced", detail: "Switched to DeFindex · 8.59% APY", when: "3h ago" },
    { id: 7, cat: "auto", kind: "compounded", detail: "Reinvested rewards +$0.31 into USD pool", when: "5h ago" },
    { id: 6, cat: "auto", kind: "froze", detail: "Paused EURC pool for safety", when: "6h ago", flag: true },
    { id: 5, cat: "auto", kind: "proposed-exit", detail: "Proposed safe exit from EURC pool", when: "6h ago", review: true },
    { id: 4, cat: "you", kind: "withdrew", detail: "Moved $500 to your wallet", when: "1d ago" },
    { id: 3, cat: "you", kind: "deposited", detail: "Deposited 1,000 USDC to USD bucket", when: "2d ago" },
    { id: 2, cat: "you", kind: "consented", detail: "Signed auto-optimize mandate", when: "2d ago" },
    { id: 1, cat: "auto", kind: "allocated", detail: "Allocated to Blend USDC", when: "2d ago" },
  ];
}

/** Display-only FX to USD for the blended "All buckets" total (never a fund conversion). */
export function getFxRateToUsd(currency: Currency): number {
  return { USD: 1, EUR: 1.08, MXN: 0.055 }[currency];
}

/** Fixture wallet balances (base units) backing the deposit % quick-fill; real read deferred. */
export function getWalletBalance(sym: StablecoinSym): bigint {
  return { USDC: 9076n, EURC: 4200n, CETES: 15000n }[sym] * UNIT;
}
```

- [ ] **Step 4: Run + typecheck**

Run: `pnpm -C frontend test lib/vault/__tests__/data.test.ts && pnpm -C frontend typecheck`
Expected: PASS; clean.

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/vault/data.ts frontend/lib/vault/__tests__/data.test.ts
git commit -m "feat(U14): frontend fixtures mirroring backend catalog/activity (STE-24)"
```

---

## Task 4: Boot seed

**Files:**
- Create: `frontend/lib/vault/seed.ts`
- Test: `frontend/lib/vault/__tests__/seed.test.ts`

**Interfaces:**
- Consumes: `MockVaultClient`, `mockSigner`, `SHARE_PRICE_SCALE` from `@sorosense/vault-client`; `UNIT`.
- Produces:
  - `SEED_POOLS: Record<Currency, string>`
  - `seedVault(client: MockVaultClient, address: string): Promise<void>` — idempotent; funds USD+EUR under `address`, allocates each to its pool, accrues a little yield, and **freezes the EUR pool** (drives the amber note + freeze banner). Sets consent for the seeded user.

- [ ] **Step 1: Write the failing test**

Create `frontend/lib/vault/__tests__/seed.test.ts`:

```ts
import { MockVaultClient } from "@sorosense/vault-client";
import { seedVault, SEED_POOLS } from "../seed";

test("seed funds two buckets, freezes EUR, and is idempotent", async () => {
  const c = new MockVaultClient();
  await seedVault(c, "GUSER");
  expect(await c.balanceOf("GUSER", "USD")).toBeGreaterThan(0n);
  expect(await c.balanceOf("GUSER", "EUR")).toBeGreaterThan(0n);
  expect(await c.balanceOf("GUSER", "MXN")).toBe(0n);
  expect(await c.poolStatus(SEED_POOLS.EUR)).toBe("frozen");
  expect(await c.poolStatus(SEED_POOLS.USD)).toBe("active");
  expect(await c.hasConsent("GUSER")).toBe(true);

  const usd = await c.balanceOf("GUSER", "USD");
  await seedVault(c, "GUSER"); // second run is a no-op
  expect(await c.balanceOf("GUSER", "USD")).toBe(usd);
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `pnpm -C frontend test lib/vault/__tests__/seed.test.ts`
Expected: FAIL — cannot resolve `../seed`.

- [ ] **Step 3: Implement**

Create `frontend/lib/vault/seed.ts`:

```ts
import { MockVaultClient, mockSigner, type Currency } from "@sorosense/vault-client";
import { UNIT } from "./units";

/** Stable pool ids per currency for the seeded funded state. */
export const SEED_POOLS: Record<Currency, string> = {
  USD: "pool-defindex-usd",
  EUR: "pool-blend-eur",
  MXN: "pool-etherfuse-mxn",
};

/**
 * Dev-only: put the mock vault into a realistic funded state under `address` so Home is not empty,
 * withdraw has ≥2 buckets, and the EUR pool is paused (amber note + banner). Idempotent. Replaced
 * by real reads at integration (U20).
 */
export async function seedVault(client: MockVaultClient, address: string): Promise<void> {
  if ((await client.balanceOf(address, "USD")) > 0n) return;
  const dep = mockSigner("depositor", address);
  const keep = mockSigner("keeper");
  await client.setPolicyConsent(address).signAndSubmit(dep);
  await client.deposit(address, "USD", 1024n * UNIT + 3_000_000n).signAndSubmit(dep); // 1024.30
  await client.deposit(address, "EUR", 920n * UNIT + 1_000_000n).signAndSubmit(dep);  // 920.10
  await client.allocate(SEED_POOLS.USD, "USD", 1024n * UNIT).signAndSubmit(keep);
  await client.allocate(SEED_POOLS.EUR, "EUR", 920n * UNIT).signAndSubmit(keep);
  client.simulateYield("USD", 92n * UNIT);  // ~ +$92 earned
  client.simulateYield("EUR", 84n * UNIT);
  await client.freeze(SEED_POOLS.EUR).signAndSubmit(keep);
}
```

- [ ] **Step 4: Run + typecheck**

Run: `pnpm -C frontend test lib/vault/__tests__/seed.test.ts && pnpm -C frontend typecheck`
Expected: PASS; clean.

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/vault/seed.ts frontend/lib/vault/__tests__/seed.test.ts
git commit -m "feat(U14): dev boot seed for a funded mock vault (STE-24)"
```

---

## Task 5: VaultProvider + useVault

**Files:**
- Create: `frontend/providers/VaultProvider.tsx`, `frontend/hooks/useVault.ts`
- Modify: `frontend/app/layout.tsx` (nest `<VaultProvider>` inside `<WalletProvider>`)
- Test: `frontend/providers/__tests__/VaultProvider.test.tsx`

**Interfaces:**
- Consumes: `useWallet()` (`address`), `MockVaultClient`, `seedVault`.
- Produces:
  - `VaultProvider({ children, client? }: { children: ReactNode; client?: MockVaultClient })` — uses a module singleton when `client` is omitted; seeds it when an `address` is present.
  - `useVault(): { client: MockVaultClient }`

- [ ] **Step 1: Write the failing test**

Create `frontend/providers/__tests__/VaultProvider.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import { MockVaultClient } from "@sorosense/vault-client";
import { VaultProvider } from "../VaultProvider";
import { useVault } from "../../hooks/useVault";

const useWallet = vi.fn();
vi.mock("../../hooks/useWallet", () => ({ useWallet: () => useWallet() }));

function Probe() {
  const { client } = useVault();
  return <span>client:{client ? "yes" : "no"}</span>;
}

test("provides an injected client and seeds it when connected", async () => {
  useWallet.mockReturnValue({ address: "GUSER" });
  const client = new MockVaultClient();
  render(<VaultProvider client={client}><Probe /></VaultProvider>);
  expect(screen.getByText("client:yes")).toBeInTheDocument();
  await waitFor(async () => expect(await client.balanceOf("GUSER", "USD")).toBeGreaterThan(0n));
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `pnpm -C frontend test providers/__tests__/VaultProvider.test.tsx`
Expected: FAIL — cannot resolve `../VaultProvider`.

- [ ] **Step 3: Implement the provider + hook**

Create `frontend/providers/VaultProvider.tsx`:

```tsx
"use client";
import { createContext, useEffect, useRef, useState, type ReactNode } from "react";
import { MockVaultClient } from "@sorosense/vault-client";
import { useWallet } from "../hooks/useWallet";
import { seedVault } from "../lib/vault/seed";

type Ctx = { client: MockVaultClient };
export const VaultContext = createContext<Ctx | null>(null);

// Module singleton so a deposit made on one screen is visible on another (mock is in-memory).
let singleton: MockVaultClient | null = null;
function getSingleton(): MockVaultClient {
  if (!singleton) singleton = new MockVaultClient();
  return singleton;
}

export function VaultProvider({ children, client }: { children: ReactNode; client?: MockVaultClient }) {
  const ref = useRef<MockVaultClient>(client ?? getSingleton());
  const { address } = useWallet();
  const [, force] = useState(0);

  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    // Dev-only seed; a no-op once the bucket is funded. Replaced by real reads at U20.
    void seedVault(ref.current, address).then(() => {
      if (!cancelled) force((n) => n + 1);
    });
    return () => { cancelled = true; };
  }, [address]);

  return <VaultContext.Provider value={{ client: ref.current }}>{children}</VaultContext.Provider>;
}
```

Create `frontend/hooks/useVault.ts`:

```ts
"use client";
import { useContext } from "react";
import { VaultContext } from "../providers/VaultProvider";

export function useVault() {
  const ctx = useContext(VaultContext);
  if (!ctx) throw new Error("useVault must be used within <VaultProvider>");
  return ctx;
}
```

- [ ] **Step 4: Wire into the root layout**

Read `frontend/app/layout.tsx`, then nest `<VaultProvider>` directly inside `<WalletProvider>` around `children` (import from `"../providers/VaultProvider"`). Keep everything else identical.

- [ ] **Step 5: Run + typecheck**

Run: `pnpm -C frontend test providers/__tests__/VaultProvider.test.tsx && pnpm -C frontend typecheck`
Expected: PASS; clean.

- [ ] **Step 6: Commit**

```bash
git add frontend/providers/VaultProvider.tsx frontend/hooks/useVault.ts frontend/app/layout.tsx frontend/providers/__tests__/VaultProvider.test.tsx
git commit -m "feat(U14): VaultProvider singleton + seed-on-connect (STE-24)"
```

---

## Task 6: Read hooks — useBuckets, useActivity

**Files:**
- Create: `frontend/hooks/useBuckets.ts`, `frontend/hooks/useActivity.ts`
- Test: `frontend/hooks/__tests__/useBuckets.test.tsx`

**Interfaces:**
- Produces:

```ts
export interface BucketView {
  currency: Currency; name: string; venue: string; tags: string[]; apy: number;
  shares: bigint; value: bigint;      // value in base units of the bucket currency
  valueUsd: number;                   // display-only blended USD
  frozen: boolean;                    // active pool paused
}
export function useBuckets(): { loading: boolean; error: string | null; buckets: BucketView[]; totalUsd: number };
export function useActivity(): ActivityItem[];
```

`useBuckets` reads, per currency with `balanceOf > 0`: `assetValueOf`, `activePool`→`poolStatus`, plus `getBucketMeta`/`getFxRateToUsd`. Only funded buckets are returned.

- [ ] **Step 1: Write the failing test**

Create `frontend/hooks/__tests__/useBuckets.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import { MockVaultClient } from "@sorosense/vault-client";
import { VaultProvider } from "../../providers/VaultProvider";
import { seedVault } from "../../lib/vault/seed";
import { useBuckets } from "../useBuckets";

const useWallet = vi.fn();
vi.mock("../../hooks/useWallet", () => ({ useWallet: () => useWallet() }));

function Probe() {
  const { loading, buckets, totalUsd } = useBuckets();
  if (loading) return <span>loading</span>;
  return (
    <ul>
      <li>count:{buckets.length}</li>
      <li>total:{Math.round(totalUsd)}</li>
      {buckets.map((b) => <li key={b.currency}>{b.currency}:{b.frozen ? "frozen" : "active"}</li>)}
    </ul>
  );
}

test("useBuckets lists funded buckets with frozen flag and a blended total", async () => {
  useWallet.mockReturnValue({ address: "GUSER" });
  const client = new MockVaultClient();
  await seedVault(client, "GUSER");
  render(<VaultProvider client={client}><Probe /></VaultProvider>);
  await waitFor(() => expect(screen.getByText("count:2")).toBeInTheDocument());
  expect(screen.getByText("EUR:frozen")).toBeInTheDocument();
  expect(screen.getByText("USD:active")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `pnpm -C frontend test hooks/__tests__/useBuckets.test.tsx`
Expected: FAIL — cannot resolve `../useBuckets`.

- [ ] **Step 3: Implement the hooks**

Create `frontend/hooks/useBuckets.ts`:

```ts
"use client";
import { useEffect, useState } from "react";
import type { Currency } from "@sorosense/vault-client";
import { useWallet } from "./useWallet";
import { useVault } from "./useVault";
import { getBucketMeta, getFxRateToUsd } from "../lib/vault/data";
import { UNIT } from "../lib/vault/units";

const CURRENCIES: readonly Currency[] = ["USD", "EUR", "MXN"];

export interface BucketView {
  currency: Currency; name: string; venue: string; tags: string[]; apy: number;
  shares: bigint; value: bigint; valueUsd: number; frozen: boolean;
}

export function useBuckets(): { loading: boolean; error: string | null; buckets: BucketView[]; totalUsd: number } {
  const { address } = useWallet();
  const { client } = useVault();
  const [state, setState] = useState<{ loading: boolean; error: string | null; buckets: BucketView[] }>({
    loading: true, error: null, buckets: [],
  });

  useEffect(() => {
    if (!address) { setState({ loading: false, error: null, buckets: [] }); return; }
    let cancelled = false;
    (async () => {
      try {
        const out: BucketView[] = [];
        for (const currency of CURRENCIES) {
          const shares = await client.balanceOf(address, currency);
          if (shares <= 0n) continue;
          const value = await client.assetValueOf(address, currency);
          const pool = await client.activePool(currency);
          const frozen = pool ? (await client.poolStatus(pool)) === "frozen" : false;
          const meta = getBucketMeta(currency);
          const valueUsd = (Number(value) / Number(UNIT)) * getFxRateToUsd(currency);
          out.push({ ...meta, shares, value, valueUsd, frozen });
        }
        if (!cancelled) setState({ loading: false, error: null, buckets: out });
      } catch (e) {
        if (!cancelled) setState({ loading: false, error: (e as Error).message, buckets: [] });
      }
    })();
    return () => { cancelled = true; };
  }, [address, client]);

  const totalUsd = state.buckets.reduce((sum, b) => sum + b.valueUsd, 0);
  return { ...state, totalUsd };
}
```

Create `frontend/hooks/useActivity.ts`:

```ts
"use client";
import { getActivity, type ActivityItem } from "../lib/vault/data";

export function useActivity(): ActivityItem[] {
  return getActivity();
}
```

- [ ] **Step 4: Run + typecheck**

Run: `pnpm -C frontend test hooks/__tests__/useBuckets.test.tsx && pnpm -C frontend typecheck`
Expected: PASS; clean.

- [ ] **Step 5: Commit**

```bash
git add frontend/hooks/useBuckets.ts frontend/hooks/useActivity.ts frontend/hooks/__tests__/useBuckets.test.tsx
git commit -m "feat(U14): useBuckets/useActivity read hooks over the seam (STE-24)"
```

---

## Task 7: AuthGate refactor + (flow) layout

**Files:**
- Create: `frontend/components/AuthGate.tsx`, `frontend/app/(flow)/layout.tsx`
- Modify: `frontend/app/(app)/layout.tsx`
- Test: `frontend/components/__tests__/AuthGate.test.tsx`, `frontend/app/(flow)/__tests__/flow-layout.test.tsx`

**Interfaces:**
- Produces: `AuthGate({ children }: { children: ReactNode })` — renders children when connected; redirects to `/` otherwise. `(flow)/layout.tsx` wraps children in `<AuthGate>` + a back-header chrome, **no** `BottomNav`.

- [ ] **Step 1: Write the failing tests**

Create `frontend/components/__tests__/AuthGate.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { AuthGate } from "../AuthGate";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
const useWallet = vi.fn();
vi.mock("../../hooks/useWallet", () => ({ useWallet: () => useWallet() }));

test("renders children when connected", () => {
  useWallet.mockReturnValue({ isConnected: true });
  render(<AuthGate><p>gated</p></AuthGate>);
  expect(screen.getByText("gated")).toBeInTheDocument();
});

test("redirects to / when not connected", () => {
  useWallet.mockReturnValue({ isConnected: false });
  render(<AuthGate><p>gated</p></AuthGate>);
  expect(push).toHaveBeenCalledWith("/");
});
```

Create `frontend/app/(flow)/__tests__/flow-layout.test.tsx`:

```tsx
import type { ComponentProps } from "react";
import { render, screen } from "@testing-library/react";
import FlowLayout from "../layout";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), back: vi.fn() }) }));
vi.mock("next/link", () => ({ default: (props: ComponentProps<"a">) => <a {...props} /> }));
const useWallet = vi.fn();
vi.mock("../../../hooks/useWallet", () => ({ useWallet: () => useWallet() }));

test("flow layout renders children and no bottom nav", () => {
  useWallet.mockReturnValue({ isConnected: true });
  render(<FlowLayout><p>flow body</p></FlowLayout>);
  expect(screen.getByText("flow body")).toBeInTheDocument();
  expect(screen.queryByRole("navigation", { name: "Main" })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run them, verify they fail**

Run: `pnpm -C frontend test components/__tests__/AuthGate.test.tsx "app/(flow)/__tests__/flow-layout.test.tsx"`
Expected: FAIL — modules missing.

- [ ] **Step 3: Implement AuthGate**

Create `frontend/components/AuthGate.tsx`:

```tsx
"use client";
import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "../hooks/useWallet";

export function AuthGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { isConnected } = useWallet();
  useEffect(() => {
    if (!isConnected) router.push("/");
  }, [isConnected, router]);
  return <>{children}</>;
}
```

- [ ] **Step 4: Refactor (app)/layout.tsx to use AuthGate**

Replace `frontend/app/(app)/layout.tsx` with:

```tsx
"use client";
import type { ReactNode } from "react";
import { AuthGate } from "../../components/AuthGate";
import { BottomNav } from "../../components/ui";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGate>
      <div className="relative min-h-dvh">
        <div className="px-5 pb-[120px] pt-2">{children}</div>
        <BottomNav />
      </div>
    </AuthGate>
  );
}
```

- [ ] **Step 5: Implement (flow)/layout.tsx**

Create `frontend/app/(flow)/layout.tsx` (full-page chrome; the back button uses `router.back()`; children render their own `SubScreenHeader` title, so the layout is just the gate + scroll container):

```tsx
"use client";
import type { ReactNode } from "react";
import { AuthGate } from "../../components/AuthGate";

export default function FlowLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGate>
      <div className="relative min-h-dvh bg-bg px-5 pb-10 pt-[52px]">{children}</div>
    </AuthGate>
  );
}
```

- [ ] **Step 6: Verify the existing shell test still passes**

The old `app/(app)/__tests__/shell.test.tsx` asserts redirect + nav. Update it if it imported gate internals; it renders `AppLayout` which still redirects (via AuthGate) and shows nav — it should still pass. Run it:

Run: `pnpm -C frontend test "app/(app)/__tests__/shell.test.tsx"`
Expected: PASS (both cases). If the "redirects" case fails because the mock path differs, keep the redirect assertion — AuthGate calls `router.push("/")` the same way.

- [ ] **Step 7: Run new tests + typecheck**

Run: `pnpm -C frontend test components/__tests__/AuthGate.test.tsx "app/(flow)/__tests__/flow-layout.test.tsx" && pnpm -C frontend typecheck`
Expected: PASS; clean.

- [ ] **Step 8: Commit**

```bash
git add "frontend/components/AuthGate.tsx" "frontend/app/(app)/layout.tsx" "frontend/app/(flow)/layout.tsx" frontend/components/__tests__/AuthGate.test.tsx "frontend/app/(flow)/__tests__/flow-layout.test.tsx"
git commit -m "refactor(U14): extract AuthGate; add (flow) full-page layout (STE-24)"
```

---

## Task 8: Keypad primitive

**Files:**
- Create: `frontend/components/ui/Keypad.tsx`; export from `frontend/components/ui/index.ts`
- Test: `frontend/components/ui/__tests__/Keypad.test.tsx`

**Interfaces:**
- Produces:

```ts
export function Keypad(props: {
  value: string;                       // current decimal string
  onChange: (next: string) => void;
  symbol: string;                      // "$" | "€"
  onQuick: (pct: number) => void;      // 0.1 | 0.5 | 1
}): JSX.Element
```

Markup mirrors mock-2 `.depamount` + `.keypad` + `.qpill` (lines 456–469). Digit keys append; `.` once; backspace trims to `"0"`.

- [ ] **Step 1: Write the failing test**

Create `frontend/components/ui/__tests__/Keypad.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { Keypad } from "../Keypad";

function Harness() {
  const [v, setV] = useState("0");
  return <Keypad value={v} onChange={setV} symbol="$" onQuick={() => setV("100.00")} />;
}

test("typing digits builds the amount; backspace trims", async () => {
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(screen.getByRole("button", { name: "1" }));
  await user.click(screen.getByRole("button", { name: "2" }));
  expect(screen.getByTestId("keypad-value")).toHaveTextContent("12");
  await user.click(screen.getByRole("button", { name: "Backspace" }));
  expect(screen.getByTestId("keypad-value")).toHaveTextContent("1");
});

test("quick-fill sets the amount", async () => {
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(screen.getByRole("button", { name: "Max" }));
  expect(screen.getByTestId("keypad-value")).toHaveTextContent("100.00");
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `pnpm -C frontend test components/ui/__tests__/Keypad.test.tsx`
Expected: FAIL — cannot resolve `../Keypad`.

- [ ] **Step 3: Implement**

Create `frontend/components/ui/Keypad.tsx`:

```tsx
"use client";
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0"] as const;

export function Keypad({
  value, onChange, symbol, onQuick,
}: { value: string; onChange: (next: string) => void; symbol: string; onQuick: (pct: number) => void }) {
  const press = (k: string) => {
    if (k === ".") { if (!value.includes(".")) onChange(value + "."); return; }
    onChange(value === "0" ? k : value + k);
  };
  const back = () => onChange(value.length > 1 ? value.slice(0, -1) : "0");

  return (
    <div>
      <div className="flex flex-1 flex-col justify-center">
        <div className="text-center text-[60px] font-semibold leading-none tracking-[-.03em] [font-variant-numeric:tabular-nums]">
          <span>{symbol}</span><span data-testid="keypad-value">{value}</span>
          <span className="ml-[3px] inline-block h-[50px] w-[2px] animate-pulse bg-ink align-[-7px]" />
        </div>
      </div>
      <div className="mb-2 flex gap-2.5">
        {([["10%", 0.1], ["50%", 0.5], ["Max", 1]] as const).map(([label, pct]) => (
          <button key={label} onClick={() => onQuick(pct)}
            className="h-[52px] flex-1 rounded-[18px] bg-pill text-[15px] font-semibold text-ink">{label}</button>
        ))}
      </div>
      <div className="mb-3.5 grid grid-cols-3 gap-0.5">
        {KEYS.map((k) => (
          <button key={k} onClick={() => press(k)}
            className="h-14 rounded-[14px] text-2xl font-medium text-ink active:bg-pill">{k}</button>
        ))}
        <button aria-label="Backspace" onClick={back} className="grid h-14 place-items-center rounded-[14px] active:bg-pill">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6H9l-6 6 6 6h11a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1z" /><path d="M15 10l-4 4M11 10l4 4" />
          </svg>
        </button>
      </div>
    </div>
  );
}
```

Add to `frontend/components/ui/index.ts`:

```ts
export { Keypad } from "./Keypad";
```

- [ ] **Step 4: Run + typecheck**

Run: `pnpm -C frontend test components/ui/__tests__/Keypad.test.tsx && pnpm -C frontend typecheck`
Expected: PASS; clean.

- [ ] **Step 5: Commit**

```bash
git add frontend/components/ui/Keypad.tsx frontend/components/ui/index.ts frontend/components/ui/__tests__/Keypad.test.tsx
git commit -m "feat(U14): shared Keypad primitive for deposit/withdraw (STE-24)"
```

---

## Task 9: BucketRow + FreezeBanner + TotalHero

**Files:**
- Create: `frontend/components/bucket/BucketRow.tsx`, `frontend/components/home/FreezeBanner.tsx`, `frontend/components/home/TotalHero.tsx`
- Test: `frontend/components/bucket/__tests__/BucketRow.test.tsx`

**Interfaces:**
- Produces:
  - `BucketRow({ bucket, first }: { bucket: BucketView; first: boolean })` — coin badge, name, tag chips, `formatCurrency(value, currency)`, `apy%`.
  - `FreezeBanner({ onReview }: { onReview: () => void })` — amber-icon banner "Your earning is paused".
  - `TotalHero({ buckets, totalUsd }: { buckets: BucketView[]; totalUsd: number })` — hero amount + a bucket-cycle toggle (All buckets → each bucket).

- [ ] **Step 1: Write the failing test**

Create `frontend/components/bucket/__tests__/BucketRow.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { BucketRow } from "../BucketRow";
import type { BucketView } from "../../../hooks/useBuckets";

const bucket: BucketView = {
  currency: "USD", name: "USD bucket", venue: "DeFindex", tags: ["DeFindex", "Vault"], apy: 8.59,
  shares: 1n, value: 10_243_000_000n, valueUsd: 1024.3, frozen: false,
};

test("renders bucket name, tags, formatted value and APY, no risk label", () => {
  render(<BucketRow bucket={bucket} first />);
  expect(screen.getByText("USD bucket")).toBeInTheDocument();
  expect(screen.getByText("DeFindex")).toBeInTheDocument();
  expect(screen.getByText("$1,024.30")).toBeInTheDocument();
  expect(screen.getByText("8.59% APY")).toBeInTheDocument();
  expect(screen.queryByText(/safe|watch|conservative|balanced|risk/i)).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `pnpm -C frontend test components/bucket/__tests__/BucketRow.test.tsx`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement the three components**

Create `frontend/components/bucket/BucketRow.tsx` (mirrors mock-2 `bucketList` markup, lines 532–537):

```tsx
import { Chip } from "../ui";
import { formatCurrency } from "../../lib/vault/units";
import type { BucketView } from "../../hooks/useBuckets";

export function BucketRow({ bucket, first }: { bucket: BucketView; first: boolean }) {
  return (
    <div className={`flex items-center gap-[13px] py-3.5 ${first ? "" : "border-t border-line"}`}>
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-pill text-xs font-semibold text-pill-ink">{bucket.currency}</span>
      <div className="min-w-0 flex-1">
        <div className="font-semibold">{bucket.name}</div>
        <div className="mt-[5px] flex flex-wrap gap-1.5">
          {bucket.tags.map((t) => <Chip key={t} className="h-[22px] px-[9px] text-[11.5px]">{t}</Chip>)}
        </div>
      </div>
      <div className="text-right">
        <div className="font-semibold [font-variant-numeric:tabular-nums]">{formatCurrency(bucket.value, bucket.currency)}</div>
        <div className="text-xs font-semibold text-pos">{bucket.apy.toFixed(2)}% APY</div>
      </div>
    </div>
  );
}
```

Create `frontend/components/home/FreezeBanner.tsx` (mirrors mock-2 `.freezebanner`, lines 291–295):

```tsx
export function FreezeBanner({ onReview }: { onReview: () => void }) {
  return (
    <button onClick={onReview} aria-label="Review paused pool"
      className="mb-4 flex w-full items-center gap-3 rounded-card border border-white bg-card p-[13px_14px] text-left [box-shadow:0_1px_2px_rgba(17,19,22,.03),0_14px_34px_-22px_rgba(17,19,22,.16)]">
      <span className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-xl bg-warn-soft text-warn">
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><path d="M12 9v4M12 17h.01" />
        </svg>
      </span>
      <div className="min-w-0 flex-1">
        <div className="font-semibold">Your earning is paused</div>
        <div className="text-[12.5px] text-muted">Tap to review and approve the move</div>
      </div>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="text-faint"><path d="M9 6l6 6-6 6" /></svg>
    </button>
  );
}
```

Create `frontend/components/home/TotalHero.tsx` (mirrors `.hero` + `.togglepill`, lines 283–290; cycles All → each bucket):

```tsx
"use client";
import { useState } from "react";
import { formatCurrency } from "../../lib/vault/units";
import type { BucketView } from "../../hooks/useBuckets";

export function TotalHero({ buckets, totalUsd }: { buckets: BucketView[]; totalUsd: number }) {
  const views = [{ label: "Total value", name: "All buckets", text: `$${totalUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
    ...buckets.map((b) => ({ label: b.name, name: b.name, text: formatCurrency(b.value, b.currency) }))];
  const [i, setI] = useState(0);
  const v = views[i] ?? views[0]!;
  return (
    <div className="py-[30px] text-center">
      <div className="text-[15px] font-medium text-muted">{v.label}</div>
      <div className="mt-2 text-[54px] font-semibold leading-none tracking-[-.02em] [font-variant-numeric:tabular-nums]">{v.text}</div>
      <button onClick={() => setI((n) => (n + 1) % views.length)} aria-label="Switch bucket"
        className="mt-4 inline-flex h-10 items-center gap-2.5 rounded-full border border-white bg-card pl-[15px] pr-2.5 text-[15px] font-semibold [box-shadow:0_1px_2px_rgba(17,19,22,.04),0_8px_18px_-10px_rgba(17,19,22,.18)]">
        <span className="h-[15px] w-[15px] rounded-full border-2 border-ink-2" />{v.name}
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M8 9l4-4 4 4M8 15l4 4 4-4" /></svg>
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run + typecheck**

Run: `pnpm -C frontend test components/bucket/__tests__/BucketRow.test.tsx && pnpm -C frontend typecheck`
Expected: PASS; clean.

- [ ] **Step 5: Commit**

```bash
git add frontend/components/bucket/BucketRow.tsx frontend/components/home/FreezeBanner.tsx frontend/components/home/TotalHero.tsx frontend/components/bucket/__tests__/BucketRow.test.tsx
git commit -m "feat(U14): BucketRow, FreezeBanner, TotalHero (STE-24)"
```

---

## Task 10: ActivityRow + ActivityList

**Files:**
- Create: `frontend/components/activity/ActivityRow.tsx`, `frontend/components/activity/ActivityList.tsx`
- Test: `frontend/components/activity/__tests__/ActivityList.test.tsx`

**Interfaces:**
- Produces:
  - `ActivityRow({ item, first, onReview }: { item: ActivityItem; first: boolean; onReview?: () => void })`
  - `ActivityList({ items, onReview }: { items: ActivityItem[]; onReview?: () => void })`

- [ ] **Step 1: Write the failing test**

Create `frontend/components/activity/__tests__/ActivityList.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { ActivityList } from "../ActivityList";
import type { ActivityItem } from "../../../lib/vault/data";

const items: ActivityItem[] = [
  { id: 2, cat: "auto", kind: "rebalanced", detail: "Switched to DeFindex · 8.59% APY", when: "3h ago" },
  { id: 1, cat: "auto", kind: "proposed-exit", detail: "Proposed safe exit from EURC pool", when: "6h ago", review: true },
];

test("renders activity details and a Review affordance for review items", () => {
  render(<ActivityList items={items} onReview={() => {}} />);
  expect(screen.getByText("Switched to DeFindex · 8.59% APY")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Review" })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `pnpm -C frontend test components/activity/__tests__/ActivityList.test.tsx`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

Create `frontend/components/activity/ActivityRow.tsx` (mirrors `actHTML` + `acticon`, lines 529–539; a single generic dot/glyph is fine — no per-kind icon needed for U14):

```tsx
import type { ActivityItem } from "../../lib/vault/data";

export function ActivityRow({ item, first, onReview }: { item: ActivityItem; first: boolean; onReview?: () => void }) {
  return (
    <div className={`flex items-center gap-[13px] py-3.5 ${first ? "" : "border-t border-line"}`}>
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-pill text-pill-ink">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-semibold">{item.detail}</div>
        <div className="text-xs text-muted">{item.when}</div>
      </div>
      {item.review && onReview ? (
        <button onClick={onReview} className="h-[30px] shrink-0 rounded-full bg-[#1a1a1a] px-3.5 text-[12.5px] font-semibold text-[#f8f8f8]">Review</button>
      ) : null}
    </div>
  );
}
```

Create `frontend/components/activity/ActivityList.tsx`:

```tsx
import { ActivityRow } from "./ActivityRow";
import type { ActivityItem } from "../../lib/vault/data";

export function ActivityList({ items, onReview }: { items: ActivityItem[]; onReview?: () => void }) {
  return <div>{items.map((item, i) => <ActivityRow key={item.id} item={item} first={i === 0} onReview={onReview} />)}</div>;
}
```

- [ ] **Step 4: Run + typecheck**

Run: `pnpm -C frontend test components/activity/__tests__/ActivityList.test.tsx && pnpm -C frontend typecheck`
Expected: PASS; clean.

- [ ] **Step 5: Commit**

```bash
git add frontend/components/activity/ActivityRow.tsx frontend/components/activity/ActivityList.tsx frontend/components/activity/__tests__/ActivityList.test.tsx
git commit -m "feat(U14): ActivityRow/ActivityList (STE-24)"
```

---

## Task 11: Home page

**Files:**
- Modify: `frontend/app/(app)/home/page.tsx`
- Test: `frontend/app/(app)/home/__tests__/home.test.tsx`

**Interfaces:**
- Consumes: `useBuckets`, `useActivity`, `TotalHero`, `FreezeBanner`, `BucketRow`, `ActivityList`, `Button`, `Card`, `useRouter`.

- [ ] **Step 1: Write the failing test**

Create `frontend/app/(app)/home/__tests__/home.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import { MockVaultClient } from "@sorosense/vault-client";
import { VaultProvider } from "../../../../providers/VaultProvider";
import { seedVault } from "../../../../lib/vault/seed";
import HomePage from "../page";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
const useWallet = vi.fn();
vi.mock("../../../../hooks/useWallet", () => ({ useWallet: () => useWallet() }));

test("home renders buckets, activity preview and a View all link", async () => {
  useWallet.mockReturnValue({ address: "GUSER", isConnected: true });
  const client = new MockVaultClient();
  await seedVault(client, "GUSER");
  render(<VaultProvider client={client}><HomePage /></VaultProvider>);
  await waitFor(() => expect(screen.getByText("USD bucket")).toBeInTheDocument());
  expect(screen.getByRole("button", { name: "Add funds" })).toBeInTheDocument();
  expect(screen.getByText("View all activity")).toBeInTheDocument();
  expect(screen.getByText("Your earning is paused")).toBeInTheDocument(); // EUR pool seeded frozen
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `pnpm -C frontend test "app/(app)/home/__tests__/home.test.tsx"`
Expected: FAIL — page is still the stub.

- [ ] **Step 3: Implement Home**

Replace `frontend/app/(app)/home/page.tsx`:

```tsx
"use client";
import { useRouter } from "next/navigation";
import { Button, Card } from "../../../components/ui";
import { TotalHero } from "../../../components/home/TotalHero";
import { FreezeBanner } from "../../../components/home/FreezeBanner";
import { BucketRow } from "../../../components/bucket/BucketRow";
import { ActivityList } from "../../../components/activity/ActivityList";
import { useBuckets } from "../../../hooks/useBuckets";
import { useActivity } from "../../../hooks/useActivity";

export default function HomePage() {
  const router = useRouter();
  const { loading, buckets, totalUsd } = useBuckets();
  const activity = useActivity();
  const anyFrozen = buckets.some((b) => b.frozen);

  return (
    <div>
      <TotalHero buckets={buckets} totalUsd={totalUsd} />
      {anyFrozen && <FreezeBanner onReview={() => router.push("/account/activity")} />}
      <Button className="mb-[22px]" onClick={() => router.push("/add-funds")}>Add funds</Button>

      <h2 className="mx-1 mb-2 text-sm font-medium text-muted">Buckets</h2>
      <Card className="mb-[22px] px-5 py-1">
        {loading ? <div className="py-6 text-center text-sm text-muted">Loading…</div>
          : buckets.length === 0 ? <div className="py-6 text-center text-sm text-muted">No buckets yet. Add funds to start.</div>
          : buckets.map((b, i) => <BucketRow key={b.currency} bucket={b} first={i === 0} />)}
      </Card>

      <h2 className="mx-1 mb-2 text-sm font-medium text-muted">Agent activity</h2>
      <Card className="px-5 pb-2 pt-1">
        <ActivityList items={activity.slice(0, 3)} onReview={() => router.push("/account/activity")} />
        <button onClick={() => router.push("/account/activity")}
          className="mt-1.5 flex w-full items-center justify-center gap-[3px] border-t border-line py-[13px_0_3px] text-[13.5px] font-medium text-muted">
          View all activity
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
        </button>
      </Card>
    </div>
  );
}
```

- [ ] **Step 4: Run + typecheck**

Run: `pnpm -C frontend test "app/(app)/home/__tests__/home.test.tsx" && pnpm -C frontend typecheck`
Expected: PASS; clean.

- [ ] **Step 5: Commit**

```bash
git add "frontend/app/(app)/home/page.tsx" "frontend/app/(app)/home/__tests__/home.test.tsx"
git commit -m "feat(U14): Home — buckets + activity preview + View all (STE-24)"
```

---

## Task 12: Add funds page

**Files:**
- Create: `frontend/components/deposit/AddFunds.tsx`, `frontend/app/(flow)/add-funds/page.tsx`
- Test: `frontend/components/deposit/__tests__/AddFunds.test.tsx`

**Interfaces:**
- Produces: `AddFunds()` — a client component listing `STABLECOINS`; each row routes to `/deposit/{sym.toLowerCase()}`. Header "Add funds", section "Stablecoins". (RWA section deferred — §10 of the spec.)

- [ ] **Step 1: Write the failing test**

Create `frontend/components/deposit/__tests__/AddFunds.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AddFunds } from "../AddFunds";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, back: vi.fn() }) }));

test("lists only fundable stablecoins and routes to deposit", async () => {
  const user = userEvent.setup();
  render(<AddFunds />);
  expect(screen.getByText("USDC")).toBeInTheDocument();
  expect(screen.getByText("EURC")).toBeInTheDocument();
  expect(screen.getByText("CETES")).toBeInTheDocument();
  expect(screen.queryByText(/USDY|Real world assets/i)).not.toBeInTheDocument();
  await user.click(screen.getByText("USDC"));
  expect(push).toHaveBeenCalledWith("/deposit/usdc");
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `pnpm -C frontend test components/deposit/__tests__/AddFunds.test.tsx`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

Create `frontend/components/deposit/AddFunds.tsx` (mirrors mock-2 `depositList`, lines 559–564 + subhead 396–398; uses the `(flow)` chrome, so it renders its own header):

```tsx
"use client";
import { useRouter } from "next/navigation";
import { Card } from "../ui";
import { SubHeader } from "../ui/SubHeader";
import { STABLECOINS } from "../../lib/vault/data";

export function AddFunds() {
  const router = useRouter();
  return (
    <div>
      <SubHeader title="Add funds" />
      <h2 className="ml-1 mb-2.5 text-sm font-medium text-muted">Stablecoins</h2>
      <Card className="px-5 py-1">
        {STABLECOINS.map((s, i) => (
          <button key={s.sym} onClick={() => router.push(`/deposit/${s.sym.toLowerCase()}`)}
            className={`flex w-full items-center gap-[13px] py-3.5 text-left ${i === 0 ? "" : "border-t border-line"}`}>
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-pill text-xs font-semibold text-pill-ink">{s.currency}</span>
            <div className="min-w-0 flex-1">
              <div className="font-semibold">{s.sym}</div>
              <div className="mt-[5px] flex flex-wrap gap-1.5">
                {s.chains.map((c) => <span key={c} className="inline-flex h-[22px] items-center rounded-full bg-pill px-[9px] text-[11.5px] font-medium text-muted">{c}</span>)}
              </div>
            </div>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="text-faint"><path d="M9 6l6 6-6 6" /></svg>
          </button>
        ))}
      </Card>
    </div>
  );
}
```

Create the shared `frontend/components/ui/SubHeader.tsx` (back-header used by all `(flow)` screens; mirrors `.subhead`, lines 396/405/429/451):

```tsx
"use client";
import { useRouter } from "next/navigation";

export function SubHeader({ title }: { title: string }) {
  const router = useRouter();
  return (
    <div className="relative mb-[18px] flex h-11 items-center justify-center">
      <button aria-label="Back" onClick={() => router.back()}
        className="absolute left-0 grid h-[42px] w-[42px] place-items-center rounded-full border border-white bg-card [box-shadow:0_1px_2px_rgba(17,19,22,.04),0_8px_18px_-10px_rgba(17,19,22,.18)]">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
      </button>
      <h1 className="text-lg font-semibold">{title}</h1>
    </div>
  );
}
```

Add to `frontend/components/ui/index.ts`:

```ts
export { SubHeader } from "./SubHeader";
```

Create `frontend/app/(flow)/add-funds/page.tsx`:

```tsx
import { AddFunds } from "../../../components/deposit/AddFunds";
export default function AddFundsPage() { return <AddFunds />; }
```

- [ ] **Step 4: Run + typecheck**

Run: `pnpm -C frontend test components/deposit/__tests__/AddFunds.test.tsx && pnpm -C frontend typecheck`
Expected: PASS; clean.

- [ ] **Step 5: Commit**

```bash
git add frontend/components/deposit/AddFunds.tsx frontend/components/ui/SubHeader.tsx frontend/components/ui/index.ts "frontend/app/(flow)/add-funds/page.tsx" frontend/components/deposit/__tests__/AddFunds.test.tsx
git commit -m "feat(U14): Add funds — fundable stablecoins only (STE-24)"
```

---

## Task 13: ConsentSheet

**Files:**
- Create: `frontend/components/deposit/ConsentSheet.tsx`
- Test: `frontend/components/deposit/__tests__/ConsentSheet.test.tsx`

**Interfaces:**
- Produces: `ConsentSheet({ open, onAgree, onClose }: { open: boolean; onAgree: () => void; onClose: () => void })` — reuses `BottomSheet`; one-time mandate copy, **no tier**; "Agree & sign" calls `onAgree`.

- [ ] **Step 1: Write the failing test**

Create `frontend/components/deposit/__tests__/ConsentSheet.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConsentSheet } from "../ConsentSheet";

test("shows one-time mandate copy with no risk tier and fires onAgree", async () => {
  const user = userEvent.setup();
  const onAgree = vi.fn();
  render(<ConsentSheet open onAgree={onAgree} onClose={() => {}} />);
  expect(screen.getByText(/one-time/i)).toBeInTheDocument();
  expect(screen.queryByText(/conservative|balanced|risk|tier/i)).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /agree & sign/i }));
  expect(onAgree).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `pnpm -C frontend test components/deposit/__tests__/ConsentSheet.test.tsx`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

Create `frontend/components/deposit/ConsentSheet.tsx`:

```tsx
"use client";
import { Button, BottomSheet } from "../ui";

export function ConsentSheet({ open, onAgree, onClose }: { open: boolean; onAgree: () => void; onClose: () => void }) {
  return (
    <BottomSheet open={open} onClose={onClose} label="Authorize the safety mandate">
      <h1 className="mb-1.5 text-xl font-semibold">Authorize once, earn hands-free</h1>
      <p className="mb-[18px] text-sm text-muted">
        Sign a one-time safety mandate. It lets the agent allocate, auto-compound, and rebalance your
        funds within the safest vetted pools in this currency — no per-move approval. Your funds never
        leave the non-custodial vault, and only you can withdraw.
      </p>
      <Button onClick={onAgree}>Agree &amp; sign</Button>
      <Button variant="glass" className="mt-2.5" onClick={onClose}>Not now</Button>
    </BottomSheet>
  );
}
```

- [ ] **Step 4: Run + typecheck**

Run: `pnpm -C frontend test components/deposit/__tests__/ConsentSheet.test.tsx && pnpm -C frontend typecheck`
Expected: PASS; clean.

- [ ] **Step 5: Commit**

```bash
git add frontend/components/deposit/ConsentSheet.tsx frontend/components/deposit/__tests__/ConsentSheet.test.tsx
git commit -m "feat(U14): one-time consent sheet (KTD3, no tier) (STE-24)"
```

---

## Task 14: Deposit keypad page + flow

**Files:**
- Create: `frontend/components/deposit/DepositKeypad.tsx`, `frontend/app/(flow)/deposit/[sym]/page.tsx`
- Test: `frontend/components/deposit/__tests__/DepositKeypad.test.tsx`

**Interfaces:**
- Consumes: `useVault`, `useWallet`, `Keypad`, `ConsentSheet`, `Button`, `Toast`, `SubHeader`, `depositorSigner`, `toAmount`, `formatCurrency`, `getWalletBalance`, `stablecoinBySym`, `Currency`.
- Produces: `DepositKeypad({ sym }: { sym: string })` — full-page deposit for one stablecoin.

Flow: resolve currency from `sym`; amber note iff the currency's active pool is frozen; on "Deposit fund" → if `!hasConsent(address)` open `ConsentSheet` (Agree → `setPolicyConsent().signAndSubmit()` then deposit), else deposit directly; on success toast + `router.push("/home")`; `USER_CLOSED_MODAL` is a no-op.

- [ ] **Step 1: Write the failing test**

Create `frontend/components/deposit/__tests__/DepositKeypad.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockVaultClient } from "@sorosense/vault-client";
import { VaultProvider } from "../../../providers/VaultProvider";
import { DepositKeypad } from "../DepositKeypad";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, back: vi.fn() }) }));
const useWallet = vi.fn();
vi.mock("../../../hooks/useWallet", () => ({ useWallet: () => useWallet() }));

function setup(sym: string) {
  const sign = vi.fn(async (xdr: string) => `sig:${xdr}`);
  useWallet.mockReturnValue({ address: "GNEW", isConnected: true, signTransaction: sign });
  const client = new MockVaultClient(); // fresh: hasConsent=false → consent required
  render(<VaultProvider client={client}><DepositKeypad sym={sym} /></VaultProvider>);
  return { sign, client };
}

test("no risk-tier control is present", () => {
  setup("usdc");
  expect(screen.queryByText(/conservative|balanced|risk|tier/i)).not.toBeInTheDocument();
});

test("first deposit signs consent then deposit (two signatures)", async () => {
  const user = userEvent.setup();
  const { sign, client } = setup("usdc");
  await user.click(screen.getByRole("button", { name: "1" }));
  await user.click(screen.getByRole("button", { name: "0" }));
  await user.click(screen.getByRole("button", { name: "Deposit fund" }));
  // consent sheet appears
  await user.click(screen.getByRole("button", { name: /agree & sign/i }));
  await waitFor(() => expect(sign).toHaveBeenCalledTimes(2)); // consent + deposit
  await waitFor(async () => expect(await client.balanceOf("GNEW", "USD")).toBeGreaterThan(0n));
  expect(push).toHaveBeenCalledWith("/home");
});
```

> The amber-note case is asserted at the page level with the seeded singleton (EUR pool is seeded frozen) in Task 17, not here — a fresh `MockVaultClient` has no frozen pool.

- [ ] **Step 2: Run it, verify it fails**

Run: `pnpm -C frontend test components/deposit/__tests__/DepositKeypad.test.tsx`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

Create `frontend/components/deposit/DepositKeypad.tsx`:

```tsx
"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Currency } from "@sorosense/vault-client";
import { Button, Keypad, Toast, SubHeader } from "../ui";
import { ConsentSheet } from "./ConsentSheet";
import { useVault } from "../../hooks/useVault";
import { useWallet } from "../../hooks/useWallet";
import { depositorSigner } from "../../lib/vault/signer";
import { toAmount, fromAmount, formatCurrency } from "../../lib/vault/units";
import { stablecoinBySym, getWalletBalance, type StablecoinSym } from "../../lib/vault/data";
import { toWalletError, USER_CLOSED_MODAL } from "../../lib/wallet-error";

export function DepositKeypad({ sym }: { sym: string }) {
  const router = useRouter();
  const { client } = useVault();
  const { address, signTransaction } = useWallet();
  const coin = stablecoinBySym(sym);
  const currency: Currency = coin?.currency ?? "USD";
  const symbol = currency === "EUR" ? "€" : "$";

  const [amount, setAmount] = useState("0");
  const [frozen, setFrozen] = useState(false);
  const [consentOpen, setConsentOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const pool = await client.activePool(currency);
      const isFrozen = pool ? (await client.poolStatus(pool)) === "frozen" : false;
      if (!cancelled) setFrozen(isFrozen);
    })();
    return () => { cancelled = true; };
  }, [client, currency]);

  const quick = (pct: number) => {
    if (!coin) return;
    const max = getWalletBalance(coin.sym as StablecoinSym);
    setAmount(fromAmount(BigInt(Math.floor(Number(max) * pct))));
  };

  const runDeposit = async () => {
    if (!address) return;
    const signer = depositorSigner(address, signTransaction);
    await client.deposit(address, currency, toAmount(amount)).signAndSubmit(signer);
    setToast("Deposited. Agent is allocating.");
    router.push("/home");
  };

  const onConfirm = async () => {
    if (!address || busy || toAmount(amount) <= 0n) return;
    setBusy(true);
    try {
      if (!(await client.hasConsent(address))) { setConsentOpen(true); return; }
      await runDeposit();
    } catch (e) {
      const w = toWalletError(e);
      if (w.code !== USER_CLOSED_MODAL) setToast(w.message); // user closed modal → silent
    } finally {
      setBusy(false);
    }
  };

  const onAgree = async () => {
    if (!address) return;
    setConsentOpen(false); setBusy(true);
    try {
      const signer = depositorSigner(address, signTransaction);
      await client.setPolicyConsent(address).signAndSubmit(signer);
      await runDeposit();
    } catch (e) {
      const w = toWalletError(e);
      if (w.code !== -1) setToast(w.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-[calc(100dvh-52px)] flex-col">
      <SubHeader title={`Deposit ${coin?.sym ?? sym.toUpperCase()}`} />
      <div className="mb-1.5 text-center">
        <span className="inline-flex h-10 items-center gap-2.5 rounded-full bg-[#ECECEC] pl-2.5 pr-4 text-[15px] font-semibold">
          <span className="grid h-[22px] w-[22px] place-items-center rounded-full bg-white text-[9px] font-semibold">{currency}</span>
          {formatCurrency(getWalletBalance((coin?.sym ?? "USDC") as StablecoinSym), currency)}
        </span>
      </div>
      {frozen && (
        <div className="mx-auto mt-0.5 flex max-w-[330px] items-center gap-2 rounded-[14px] bg-warn-soft px-3.5 py-2.5 text-[12.5px] font-medium leading-[1.35] text-warn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><path d="M12 9v4M12 17h.01" /></svg>
          Your {coin?.sym ?? sym.toUpperCase()} pool is paused. New deposits go to a safe pool.
        </div>
      )}
      <Keypad value={amount} onChange={setAmount} symbol={symbol} onQuick={quick} />
      <Button onClick={onConfirm}>Deposit fund</Button>
      <p className="mt-3 text-center text-[12.5px] text-muted">
        Goes to your {currency} bucket. No conversion. The agent allocates to the safest highest yield in this currency.
      </p>
      <ConsentSheet open={consentOpen} onAgree={onAgree} onClose={() => setConsentOpen(false)} />
      <Toast open={!!toast} message={toast ?? ""} />
    </div>
  );
}
```

> Confirmed API of `frontend/lib/wallet-error.ts`: `toWalletError(e: unknown): WalletError` (with a `.code?: number`) and the constant `USER_CLOSED_MODAL = -1`. Both are used above.

Create `frontend/app/(flow)/deposit/[sym]/page.tsx` (Next 16 dynamic `params` — read the docs; params may be a Promise):

```tsx
import { DepositKeypad } from "../../../../components/deposit/DepositKeypad";

export default async function DepositPage({ params }: { params: Promise<{ sym: string }> }) {
  const { sym } = await params;
  return <DepositKeypad sym={sym} />;
}
```

- [ ] **Step 4: Verify the wallet-error helper name, then run + typecheck**

Run: `pnpm -C frontend test components/deposit/__tests__/DepositKeypad.test.tsx && pnpm -C frontend typecheck`
Expected: PASS; clean. (If `useWallet` in tests lacks `signTransaction`, the provided test supplies it.)

- [ ] **Step 5: Commit**

```bash
git add frontend/components/deposit/DepositKeypad.tsx "frontend/app/(flow)/deposit/[sym]/page.tsx" frontend/components/deposit/__tests__/DepositKeypad.test.tsx
git commit -m "feat(U14): Deposit full-page keypad + consent flow, amber freeze note (STE-24)"
```

---

## Task 15: Withdraw page

**Files:**
- Create: `frontend/components/withdraw/WithdrawKeypad.tsx`, `frontend/app/(flow)/withdraw/page.tsx`
- Test: `frontend/components/withdraw/__tests__/WithdrawKeypad.test.tsx`

**Interfaces:**
- Consumes: `useBuckets`, `useVault`, `useWallet`, `Keypad`, `Button`, `Toast`, `SubHeader`, `depositorSigner`, `toAmount`, `formatCurrency`, `SHARE_PRICE_SCALE`.
- Produces: `WithdrawKeypad()` — bucket picker pill (chevron only when ≥2 buckets), amount keypad, converts asset amount → shares (`amount·SCALE/sharePrice`; Max uses full `balanceOf` shares), signs `withdraw`.

- [ ] **Step 1: Write the failing test**

Create `frontend/components/withdraw/__tests__/WithdrawKeypad.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockVaultClient } from "@sorosense/vault-client";
import { VaultProvider } from "../../../providers/VaultProvider";
import { seedVault } from "../../../lib/vault/seed";
import { WithdrawKeypad } from "../WithdrawKeypad";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, back: vi.fn() }) }));
const useWallet = vi.fn();
vi.mock("../../../hooks/useWallet", () => ({ useWallet: () => useWallet() }));

test("shows a bucket chevron with ≥2 buckets and signs a Max withdrawal", async () => {
  const user = userEvent.setup();
  const sign = vi.fn(async (xdr: string) => `sig:${xdr}`);
  useWallet.mockReturnValue({ address: "GUSER", isConnected: true, signTransaction: sign });
  const client = new MockVaultClient();
  await seedVault(client, "GUSER"); // 2 buckets (USD, EUR)
  render(<VaultProvider client={client}><WithdrawKeypad /></VaultProvider>);
  await waitFor(() => expect(screen.getByLabelText("Choose bucket")).toBeInTheDocument());
  expect(screen.getByTestId("bucket-chevron")).toBeInTheDocument(); // ≥2 buckets
  await user.click(screen.getByRole("button", { name: "Max" }));
  await user.click(screen.getByRole("button", { name: "Move to wallet" }));
  await waitFor(() => expect(sign).toHaveBeenCalledTimes(1));
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `pnpm -C frontend test components/withdraw/__tests__/WithdrawKeypad.test.tsx`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

Create `frontend/components/withdraw/WithdrawKeypad.tsx`:

```tsx
"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { SHARE_PRICE_SCALE, type Currency } from "@sorosense/vault-client";
import { Button, Keypad, Toast, SubHeader } from "../ui";
import { useBuckets } from "../../hooks/useBuckets";
import { useVault } from "../../hooks/useVault";
import { useWallet } from "../../hooks/useWallet";
import { depositorSigner } from "../../lib/vault/signer";
import { toAmount, fromAmount, formatCurrency } from "../../lib/vault/units";

export function WithdrawKeypad() {
  const router = useRouter();
  const { buckets } = useBuckets();
  const { client } = useVault();
  const { address, signTransaction } = useWallet();
  const [i, setI] = useState(0);
  const [amount, setAmount] = useState("0");
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const active = buckets[i] ?? buckets[0];
  const symbol = active?.currency === "EUR" ? "€" : "$";
  const multi = buckets.length >= 2;

  useEffect(() => { setAmount("0"); }, [i]);

  const quick = (pct: number) => {
    if (!active) return;
    setAmount(fromAmount(BigInt(Math.floor(Number(active.value) * pct))));
  };

  const onConfirm = async () => {
    if (!address || !active || busy) return;
    const isMax = toAmount(amount) >= active.value;
    setBusy(true);
    try {
      const currency: Currency = active.currency;
      const price = await client.sharePrice(currency);
      const shares = isMax
        ? await client.balanceOf(address, currency)
        : (toAmount(amount) * SHARE_PRICE_SCALE) / price;
      if (shares <= 0n) { setBusy(false); return; }
      await client.withdraw(address, currency, shares).signAndSubmit(depositorSigner(address, signTransaction));
      setToast("Sent to your wallet");
      router.push("/home");
    } catch (e) {
      setToast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-[calc(100dvh-52px)] flex-col">
      <SubHeader title="Move to wallet" />
      <div className="mb-1 text-center">
        <button aria-label="Choose bucket" onClick={() => multi && setI((n) => (n + 1) % buckets.length)}
          className="inline-flex h-10 items-center gap-2.5 rounded-full bg-[#ECECEC] pl-2.5 pr-4 text-[15px] font-semibold">
          <span className="grid h-[22px] w-[22px] place-items-center rounded-full bg-white text-[9px] font-semibold">{active?.currency ?? "USD"}</span>
          {active?.name ?? "USD bucket"}
          {multi && (
            <svg data-testid="bucket-chevron" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M8 9l4-4 4 4M8 15l4 4 4-4" /></svg>
          )}
        </button>
      </div>
      <div className="mb-0.5 text-center text-[12.5px] text-muted">
        {active ? `${formatCurrency(active.value, active.currency)} available` : "—"}
      </div>
      <Keypad value={amount} onChange={setAmount} symbol={symbol} onQuick={quick} />
      <Button onClick={onConfirm}>Move to wallet</Button>
      <Toast open={!!toast} message={toast ?? ""} />
    </div>
  );
}
```

Create `frontend/app/(flow)/withdraw/page.tsx`:

```tsx
import { WithdrawKeypad } from "../../../components/withdraw/WithdrawKeypad";
export default function WithdrawPage() { return <WithdrawKeypad />; }
```

- [ ] **Step 4: Run + typecheck**

Run: `pnpm -C frontend test components/withdraw/__tests__/WithdrawKeypad.test.tsx && pnpm -C frontend typecheck`
Expected: PASS; clean.

- [ ] **Step 5: Commit**

```bash
git add frontend/components/withdraw/WithdrawKeypad.tsx "frontend/app/(flow)/withdraw/page.tsx" frontend/components/withdraw/__tests__/WithdrawKeypad.test.tsx
git commit -m "feat(U14): Withdraw — bucket picker + amount→shares (STE-24)"
```

---

## Task 16: Earn stub + Activity page

**Files:**
- Modify: `frontend/app/(app)/earn/page.tsx`
- Create: `frontend/app/(flow)/account/activity/page.tsx`
- Test: `frontend/app/(app)/earn/__tests__/earn.test.tsx`, `frontend/app/(flow)/account/activity/__tests__/activity.test.tsx`

**Interfaces:**
- Earn stub: balance hero (`totalUsd`) + `Deposit` → `/add-funds` + `Move to wallet` → `/withdraw`. Simulator/growth deferred to U16.
- Activity page: `SubHeader "Activity"` + segmented filter All/Yours/Automated over `useActivity()`.

- [ ] **Step 1: Write the failing tests**

Create `frontend/app/(app)/earn/__tests__/earn.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockVaultClient } from "@sorosense/vault-client";
import { VaultProvider } from "../../../../providers/VaultProvider";
import { seedVault } from "../../../../lib/vault/seed";
import EarnPage from "../page";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
const useWallet = vi.fn();
vi.mock("../../../../hooks/useWallet", () => ({ useWallet: () => useWallet() }));

test("earn stub routes to deposit and withdraw", async () => {
  const user = userEvent.setup();
  useWallet.mockReturnValue({ address: "GUSER", isConnected: true });
  const client = new MockVaultClient();
  await seedVault(client, "GUSER");
  render(<VaultProvider client={client}><EarnPage /></VaultProvider>);
  await waitFor(() => expect(screen.getByRole("button", { name: "Move to wallet" })).toBeInTheDocument());
  await user.click(screen.getByRole("button", { name: "Move to wallet" }));
  expect(push).toHaveBeenCalledWith("/withdraw");
});
```

Create `frontend/app/(flow)/account/activity/__tests__/activity.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ActivityPage from "../page";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), back: vi.fn() }) }));

test("activity page filters to Yours", async () => {
  const user = userEvent.setup();
  render(<ActivityPage />);
  expect(screen.getByText(/Switched to DeFindex/)).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Yours" }));
  expect(screen.queryByText(/Switched to DeFindex/)).not.toBeInTheDocument(); // auto item hidden
  expect(screen.getByText(/Moved \$500 to your wallet/)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run them, verify they fail**

Run: `pnpm -C frontend test "app/(app)/earn/__tests__/earn.test.tsx" "app/(flow)/account/activity/__tests__/activity.test.tsx"`
Expected: FAIL — earn is a stub, activity page missing.

- [ ] **Step 3: Implement the Earn stub**

Replace `frontend/app/(app)/earn/page.tsx`:

```tsx
"use client";
import { useRouter } from "next/navigation";
import { Button } from "../../../components/ui";
import { useBuckets } from "../../../hooks/useBuckets";

export default function EarnPage() {
  const router = useRouter();
  const { totalUsd } = useBuckets();
  return (
    <div>
      <div className="py-4 text-center">
        <div className="text-[15px] font-medium text-muted">You&apos;re earning</div>
        <div className="mt-2 text-[54px] font-semibold leading-none tracking-[-.02em] [font-variant-numeric:tabular-nums]">
          ${totalUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
      </div>
      <div className="flex gap-3">
        <Button onClick={() => router.push("/add-funds")}>Deposit</Button>
        <Button variant="glass" onClick={() => router.push("/withdraw")}>Move to wallet</Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Implement the Activity page**

Create `frontend/app/(flow)/account/activity/page.tsx`:

```tsx
"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Card, SubHeader } from "../../../../components/ui";
import { ActivityList } from "../../../../components/activity/ActivityList";
import { useActivity } from "../../../../hooks/useActivity";

const FILTERS = [{ key: "all", label: "All" }, { key: "you", label: "Yours" }, { key: "auto", label: "Automated" }] as const;

export default function ActivityPage() {
  const router = useRouter();
  const items = useActivity();
  const [filter, setFilter] = useState<"all" | "you" | "auto">("all");
  const shown = filter === "all" ? items : items.filter((a) => a.cat === filter);
  return (
    <div>
      <SubHeader title="Activity" />
      <div className="mb-3.5 flex gap-1.5">
        {FILTERS.map((f) => (
          <button key={f.key} aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}
            className={`h-9 flex-1 rounded-full text-[13.5px] font-medium ${filter === f.key ? "bg-pill text-pill-ink" : "text-[#8a8a8a]"}`}>{f.label}</button>
        ))}
      </div>
      <Card className="px-5 py-1">
        <ActivityList items={shown} onReview={() => router.push("/account/activity")} />
      </Card>
    </div>
  );
}
```

- [ ] **Step 5: Run + typecheck**

Run: `pnpm -C frontend test "app/(app)/earn/__tests__/earn.test.tsx" "app/(flow)/account/activity/__tests__/activity.test.tsx" && pnpm -C frontend typecheck`
Expected: PASS; clean.

- [ ] **Step 6: Commit**

```bash
git add "frontend/app/(app)/earn/page.tsx" "frontend/app/(flow)/account/activity/page.tsx" "frontend/app/(app)/earn/__tests__/earn.test.tsx" "frontend/app/(flow)/account/activity/__tests__/activity.test.tsx"
git commit -m "feat(U14): Earn stub (withdraw entry) + Activity page (STE-24)"
```

---

## Task 17: Integration test (deposit→home) + amber note + full green gate

**Files:**
- Create: `frontend/app/(flow)/deposit/[sym]/__tests__/deposit-integration.test.tsx`

**Interfaces:**
- Consumes everything; drives the seeded singleton path.

- [ ] **Step 1: Write the integration test**

Create `frontend/app/(flow)/deposit/[sym]/__tests__/deposit-integration.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import { MockVaultClient } from "@sorosense/vault-client";
import { VaultProvider } from "../../../../../providers/VaultProvider";
import { seedVault } from "../../../../../lib/vault/seed";
import { DepositKeypad } from "../../../../../components/deposit/DepositKeypad";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), back: vi.fn() }) }));
const useWallet = vi.fn();
vi.mock("../../../../../hooks/useWallet", () => ({ useWallet: () => useWallet() }));

test("EURC deposit shows the amber paused-pool note (seeded frozen EUR)", async () => {
  const sign = vi.fn(async (x: string) => x);
  useWallet.mockReturnValue({ address: "GUSER", isConnected: true, signTransaction: sign });
  const client = new MockVaultClient();
  await seedVault(client, "GUSER"); // EUR pool seeded frozen
  render(<VaultProvider client={client}><DepositKeypad sym="eurc" /></VaultProvider>);
  await waitFor(() => expect(screen.getByText(/pool is paused/i)).toBeInTheDocument());
});

test("USDC deposit shows no amber note (USD pool active)", async () => {
  const sign = vi.fn(async (x: string) => x);
  useWallet.mockReturnValue({ address: "GUSER", isConnected: true, signTransaction: sign });
  const client = new MockVaultClient();
  await seedVault(client, "GUSER");
  render(<VaultProvider client={client}><DepositKeypad sym="usdc" /></VaultProvider>);
  await waitFor(() => expect(screen.getByRole("button", { name: "Deposit fund" })).toBeInTheDocument());
  expect(screen.queryByText(/pool is paused/i)).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run the full suite + typecheck + lint + build**

Run: `pnpm -C frontend test && pnpm -C frontend typecheck && pnpm -C frontend lint && pnpm -C frontend build`
Expected: all PASS. Fix any failures before committing.

- [ ] **Step 3: Commit**

```bash
git add "frontend/app/(flow)/deposit/[sym]/__tests__/deposit-integration.test.tsx"
git commit -m "test(U14): deposit→home + amber freeze-note integration (STE-24)"
```

---

## Task 18: E2E evidence + PR

**Files:**
- Create: `docs/tests/linear-STE-24/e2e-evidence.md`

- [ ] **Step 1: Run the dev server and capture the flows**

Run: `pnpm -C frontend dev` (note the URL). Connect Freighter at a **desktop viewport** (device-mode mobile UA makes Freighter show "Install" — memory `freighter-devtools-device-mode`).

Capture before/after composites for: Home (buckets + activity + freeze banner), Add funds (stablecoins only), Deposit keypad (no risk tier + amber note on EURC), first-deposit consent sign, Withdraw bucket picker (chevron with ≥2), Activity page filter. Annotate and combine per `pr-e2e-evidence`.

- [ ] **Step 2: Draft the evidence doc**

Create `docs/tests/linear-STE-24/e2e-evidence.md` using the `pr-e2e-evidence` template from STE-7 (Summary, E2E evidence with branch/commit/URL, before/after composite, Result, Console/network notes, Checklist: matches mock-2 · no risk labels/tier/chatbot/hub · unit scenarios pass · rendered composite).

- [ ] **Step 3: Push and open the PR**

```bash
git push -u origin AncungAulia/ancungaulia-ste-24-u14-home-add-funds-deposit-withdraw
gh pr create --base main --title "feat(U14): Home + Add funds + Deposit + Withdraw (STE-24)" --body-file <(printf '%s\n' "<paste the pr-e2e-evidence body>")
```

- [ ] **Step 4: Commit the evidence doc**

```bash
git add docs/tests/linear-STE-24/e2e-evidence.md
git commit -m "docs(U14): e2e evidence (STE-24)"
git push
```

---

## Self-review notes

- **Spec coverage:** Home (T11), Add funds/R19 (T12), Deposit full-page keypad + no tier + footnote (T14), consent KTD3 (T13/T14), amber freeze note via activePool+poolStatus (T14/T17), freeze banner display-only → activity (T11), Withdraw bucket picker + chevron≥2 + amount→shares (T15), View all → /account/activity (T11/T16), data layer mock + one-file swap (T3–T6), signer over U13 wallet (T2), DRY primitives incl. shared Keypad (T8), Earn stub withdraw entry (T16), loading/empty/error (T6/T11), tests + e2e (T17/T18). RWA gated (§10) — not built.
- **Assumptions to verify during execution:** Next 16 dynamic `params` is a Promise (Task 14 page awaits it) and the route-group `(flow)/account/activity` resolves to `/account/activity` without colliding with `(app)/account` — read `node_modules/next/dist/docs/` for App Router route groups + dynamic params before writing the routes. `wallet-error.ts` API is confirmed (`toWalletError`, `USER_CLOSED_MODAL`).
```
