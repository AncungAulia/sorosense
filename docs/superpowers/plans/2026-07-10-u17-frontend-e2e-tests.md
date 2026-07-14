# U17 · Frontend e2e tests + wiring — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a Playwright harness plus `frontend/e2e/demo-flow.spec.ts`, covering the full demo journey and two invariants, green under `pnpm e2e` against `MockVaultClient` and a keeper stub.

**Architecture:** One build-time flag, `NEXT_PUBLIC_E2E === "1"`, opens two seams that are dead code in a production build. (1) `lib/wallet.ts` becomes a dispatcher choosing between `lib/wallet-real.ts` (Stellar Wallets Kit) and `lib/wallet-e2e.ts` (in-memory stub). (2) `VaultProvider` skips `seedVault()` and installs `window.__sorosense__.keeper`, so the test — not a dev seed — drives allocate / compound / freeze / proposeExit / rebalance. The vault starts empty; every state change in the journey has a visible cause.

**Tech Stack:** Next 16 · React 19 · Playwright (`@playwright/test`) · `@sorosense/vault-client` (`MockVaultClient`, `mockSigner`) · vitest (unchanged, for unit tests).

**Spec:** `docs/superpowers/specs/2026-07-10-u17-frontend-e2e-tests-design.md`

## Global Constraints

- **Typecheck is a hard gate.** `tsc --noEmit` is strict with `noUncheckedIndexedAccess`; indexed access yields `T | undefined`. Playwright specs and config are inside `frontend/tsconfig.json`'s `**/*.ts` include, so they are typechecked too.
- **Never `npm install` inside a package.** Use `pnpm -C frontend add -D <pkg>`; one shared lockfile at the repo root.
- **Safety is invisible.** No `risk` / `tier` / `score` field, label, or copy on any user surface.
- **No new `data-testid` and no production DOM change.** Selectors must use roles and aria labels that already exist. The two `data-testid`s the specs consume (`amount`, `projection` in `components/simulator/Simulator.tsx:68,88`) already ship.
- **`BottomSheet` is always mounted** (`components/ui/BottomSheet.tsx:14-17`): `role="dialog"` exists even when closed, distinguished only by `aria-hidden={!open}`. Playwright's role engine ignores `aria-hidden="true"` subtrees, so `getByRole` is the correct tool and raw `locator('[role=dialog]')` is not.
- **Amounts crossing the Node↔browser boundary are decimal strings**, never `bigint` (`page.evaluate` cannot serialize `bigint`). The bridge parses them with `toAmount()` from `lib/vault/units.ts`.
- **Existing exported constants are reused, never retyped:** `SEED_POOLS` / `SEED_SAFE_EXIT` (`lib/vault/seed.ts:6,13`).

---

### Task 1: Playwright harness

**Files:**
- Create: `frontend/playwright.config.ts`
- Create: `frontend/e2e/smoke.spec.ts` (deleted in Task 4 once `demo-flow.spec.ts` supersedes it)
- Modify: `frontend/package.json` (add `@playwright/test` devDependency + `e2e` script)
- Modify: `package.json` (root: add `e2e` passthrough)
- Modify: `frontend/vitest.config.mts` (exclude `e2e/**`)

**Interfaces:**
- Consumes: nothing.
- Produces: `pnpm e2e` (root) → `playwright test` in `frontend/`, serving `next dev` with `NEXT_PUBLIC_E2E=1` at `http://localhost:3000`, one project `mobile-chromium` on the `Pixel 5` viewport.

- [ ] **Step 1: Install Playwright**

```bash
pnpm -C frontend add -D @playwright/test
pnpm -C frontend exec playwright install chromium
```

- [ ] **Step 2: Write the config**

Create `frontend/playwright.config.ts`:

```ts
import { defineConfig, devices } from "@playwright/test";

/**
 * The app is mobile-first, so one project at a phone viewport is the honest default. Freighter is
 * stubbed at the `lib/wallet.ts` seam under NEXT_PUBLIC_E2E, which is why device-mode — the trap
 * that forced U13–U16 to capture evidence at a desktop viewport — no longer applies here.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false, // MockVaultClient is a module singleton; specs share one dev server
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "list" : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "mobile-chromium", use: { ...devices["Pixel 5"] } }],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    env: { NEXT_PUBLIC_E2E: "1" },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
```

- [ ] **Step 3: Keep vitest off the Playwright specs**

`frontend/vitest.config.mts` — vitest's default `include` glob (`**/*.spec.ts`) would otherwise pick up `e2e/demo-flow.spec.ts` and fail on the `@playwright/test` import:

```ts
import { defineConfig, configDefaults } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    // Playwright owns `e2e/`; vitest's default include would otherwise match its .spec.ts files.
    exclude: [...configDefaults.exclude, "e2e/**"],
  },
});
```

- [ ] **Step 4: Add the scripts**

`frontend/package.json`, in `"scripts"`, after `"test:watch"`:

```json
    "e2e": "playwright test",
```

Root `package.json`, in `"scripts"`, after `"lint"`:

```json
    "e2e": "pnpm -C frontend e2e",
```

- [ ] **Step 5: Write the failing smoke test**

Create `frontend/e2e/smoke.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test("the landing page offers a wallet connection", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Connect wallet" })).toBeVisible();
});
```

- [ ] **Step 6: Run it**

Run: `pnpm e2e` (from the repo root)
Expected: PASS, `1 passed`. If it fails on a missing browser, re-run `pnpm -C frontend exec playwright install chromium`.

- [ ] **Step 7: Verify the unit suite still passes and vitest ignores `e2e/`**

Run: `pnpm -C frontend test`
Expected: PASS, and no test file under `e2e/` is listed.

- [ ] **Step 8: Commit**

```bash
git add frontend/playwright.config.ts frontend/e2e/smoke.spec.ts frontend/package.json frontend/vitest.config.mts package.json pnpm-lock.yaml
git commit -m "test(U17): a Playwright harness the repo did not have (STE-27)"
```

---

### Task 2: Stub the wallet behind the `lib/wallet.ts` seam

**Files:**
- Create: `frontend/lib/wallet-real.ts` (via `git mv` of today's `lib/wallet.ts`)
- Create: `frontend/lib/wallet-e2e.ts`
- Create: `frontend/lib/wallet.ts` (new dispatcher)
- Create: `frontend/lib/__tests__/wallet-e2e.test.ts`
- Modify: `frontend/lib/__tests__/wallet.test.ts:1` region (retarget import to `../wallet-real`)
- Modify: `frontend/e2e/smoke.spec.ts` (add the connect assertion)

**Interfaces:**
- Consumes: Task 1's harness.
- Produces:
  - `lib/wallet.ts` exports, unchanged in shape for `providers/WalletProvider.tsx:3`: `connect(): Promise<{ address: string; name: string }>`, `getAddress(): Promise<string>`, `signTransaction(xdr: string): Promise<string>`, `disconnect(): Promise<void>`, plus the re-exported `WalletError` / `USER_CLOSED_MODAL`.
  - `lib/wallet-e2e.ts` exports `E2E_ADDRESS: string` (a 56-character `G…` Stellar address) and `E2E_WALLET_NAME = "Freighter"`, both consumed by the specs.

- [ ] **Step 1: Move the real implementation**

```bash
git mv frontend/lib/wallet.ts frontend/lib/wallet-real.ts
```

In `frontend/lib/wallet-real.ts`, delete the re-export line `export { WalletError, USER_CLOSED_MODAL } from "./wallet-error";` — the new `lib/wallet.ts` owns it now. Everything else stays byte-for-byte, including `getKit()` and `getWalletName()`.

- [ ] **Step 2: Retarget the existing unit test**

In `frontend/lib/__tests__/wallet.test.ts`, change every `from "../wallet"` to `from "../wallet-real"`. No assertion changes.

- [ ] **Step 3: Write the failing test for the stub**

Create `frontend/lib/__tests__/wallet-e2e.test.ts`:

```ts
import { beforeEach, expect, test } from "vitest";
import { E2E_ADDRESS, E2E_WALLET_NAME, connect, disconnect, getAddress, signTransaction } from "../wallet-e2e";

beforeEach(async () => {
  await disconnect();
});

test("the address is a well-formed Stellar public key", () => {
  expect(E2E_ADDRESS).toMatch(/^G[A-Z2-7]{55}$/);
});

test("connect resolves a deterministic address and wallet name", async () => {
  expect(await connect()).toEqual({ address: E2E_ADDRESS, name: E2E_WALLET_NAME });
});

test("getAddress throws before connect and resolves after", async () => {
  await expect(getAddress()).rejects.toThrow("no e2e wallet connected");
  await connect();
  expect(await getAddress()).toBe(E2E_ADDRESS);
});

test("signTransaction marks the xdr rather than producing a real signature", async () => {
  await connect();
  expect(await signTransaction("mock-xdr-1")).toBe("e2e-signed:mock-xdr-1");
});

test("signTransaction refuses when disconnected", async () => {
  await expect(signTransaction("mock-xdr-1")).rejects.toThrow("no e2e wallet connected");
});
```

- [ ] **Step 4: Run it to verify it fails**

Run: `pnpm -C frontend test -- wallet-e2e`
Expected: FAIL — `Failed to resolve import "../wallet-e2e"`.

- [ ] **Step 5: Write the stub**

Create `frontend/lib/wallet-e2e.ts`:

```ts
/**
 * The wallet layer Playwright drives. Freighter is a browser extension: automating its popup would
 * mean loading an unpacked extension and a seed phrase into the test browser. Instead `lib/wallet.ts`
 * swaps this module in when NEXT_PUBLIC_E2E === "1", so the app under test signs without a popup.
 *
 * `signTransaction` returns a marker, not a signature. Nothing verifies it: `MockVaultClient` calls
 * `signer.sign(xdr)` and discards the result. When the real bindings land (U20) this module is not
 * part of that path — the dispatcher simply never selects it outside an e2e run.
 */
export { WalletError, USER_CLOSED_MODAL } from "./wallet-error";

/** A real, well-formed testnet public key. Deterministic so specs can assert on the Account chip. */
export const E2E_ADDRESS = "GA6HCMBLTZS5VYYBCATRBRZ3BZJMAFUDKYYF6AH6MVCMGWMRDNSWJPIH";

/** The app persists the product name captured at connect time; the stub stands in for Freighter. */
export const E2E_WALLET_NAME = "Freighter";

let connected = false;

function requireConnected(): void {
  if (!connected) throw new Error("no e2e wallet connected");
}

export async function connect(): Promise<{ address: string; name: string }> {
  connected = true;
  return { address: E2E_ADDRESS, name: E2E_WALLET_NAME };
}

export async function getAddress(): Promise<string> {
  requireConnected();
  return E2E_ADDRESS;
}

export async function signTransaction(xdr: string): Promise<string> {
  requireConnected();
  return `e2e-signed:${xdr}`;
}

export async function disconnect(): Promise<void> {
  connected = false;
}
```

- [ ] **Step 6: Write the dispatcher**

Create `frontend/lib/wallet.ts`:

```ts
import * as e2e from "./wallet-e2e";
import * as real from "./wallet-real";

export { WalletError, USER_CLOSED_MODAL } from "./wallet-error";

/**
 * Next inlines NEXT_PUBLIC_* at build time, so in a production build this is `"" === "1"` and every
 * e2e branch below is dead. `wallet-e2e.ts` still travels in the bundle — the ternaries reference it —
 * but it is ~30 lines, holds no key material, and is unreachable. Excluding it outright would need a
 * webpack alias; that config surface costs more than it buys. See the U17 design doc.
 */
const E2E = process.env.NEXT_PUBLIC_E2E === "1";

export const connect = E2E ? e2e.connect : real.connect;
export const getAddress = E2E ? e2e.getAddress : real.getAddress;
export const signTransaction = E2E ? e2e.signTransaction : real.signTransaction;
export const disconnect = E2E ? e2e.disconnect : real.disconnect;
```

- [ ] **Step 7: Run the unit suite**

Run: `pnpm -C frontend test`
Expected: PASS — `wallet.test.ts` (now against `wallet-real`) and the new `wallet-e2e.test.ts` both green.

- [ ] **Step 8: Prove the stub reaches the browser**

Replace the body of `frontend/e2e/smoke.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { E2E_ADDRESS } from "../lib/wallet-e2e";

test("connecting a stubbed wallet enters the app", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Connect wallet" }).click();
  await expect(page).toHaveURL(/\/home$/);
  await expect
    .poll(() => page.evaluate(() => window.localStorage.getItem("soro.wallet")))
    .toBe(E2E_ADDRESS);
});
```

- [ ] **Step 9: Run it**

Run: `pnpm e2e`
Expected: PASS. The app navigates to `/home` with no wallet popup.

- [ ] **Step 10: Typecheck and lint**

Run: `pnpm -r typecheck && pnpm -C frontend lint`
Expected: both clean.

- [ ] **Step 11: Commit**

```bash
git add frontend/lib/wallet.ts frontend/lib/wallet-real.ts frontend/lib/wallet-e2e.ts frontend/lib/__tests__ frontend/e2e/smoke.spec.ts
git commit -m "test(U17): Playwright cannot click a Freighter popup, so stub the wallet seam (STE-27)"
```

---

### Task 3: Replace the dev seed with a keeper bridge

**Files:**
- Create: `frontend/lib/e2e/bridge.ts`
- Create: `frontend/lib/e2e/__tests__/bridge.test.ts`
- Modify: `frontend/providers/VaultProvider.tsx:24-32` (skip the seed; install the bridge)
- Create: `frontend/e2e/support/bridge.ts`
- Modify: `frontend/e2e/smoke.spec.ts` (assert the empty Earn state is now reachable)

**Interfaces:**
- Consumes: Task 2's stubbed `connect()`.
- Produces:
  - `lib/e2e/bridge.ts` exports `E2E: boolean`, `installE2EBridge(client: MockVaultClient, bump: () => void): void`, and `type KeeperAction = "allocate" | "compound" | "freeze" | "proposeExit" | "rebalance"`.
  - At runtime under the flag: `window.__sorosense__ = { keeper }` where every keeper method has signature `(currency: Currency, amount: string) => Promise<void>` (`freeze` and `proposeExit` ignore `amount`) and calls `bump()` itself.
  - `e2e/support/bridge.ts` exports `keeper(page: Page, action: KeeperAction, currency: Currency, amount?: string): Promise<void>`.

- [ ] **Step 1: Write the failing test**

Create `frontend/lib/e2e/__tests__/bridge.test.ts`. `E2E` is false under vitest, so the test drives the internal factory directly — `installE2EBridge` is only the flag-gated wrapper around it:

```ts
import { beforeEach, expect, test } from "vitest";
import { MockVaultClient } from "@sorosense/vault-client";
import { SEED_POOLS, SEED_SAFE_EXIT } from "../../vault/seed";
import { createKeeperBridge } from "../bridge";

const USER = "GTESTUSER";
let client: MockVaultClient;
let bumps: number;

beforeEach(() => {
  client = new MockVaultClient();
  bumps = 0;
});

const bridge = () => createKeeperBridge(client, () => void bumps++);

test("allocate sets the bucket's active pool and bumps", async () => {
  await bridge().allocate("EUR", "500");
  expect(await client.activePool("EUR")).toBe(SEED_POOLS.EUR);
  expect(bumps).toBe(1);
});

test("compound raises the bucket's value without minting shares", async () => {
  await client.deposit(USER, "EUR", 500_0000000n).signAndSubmit({ role: "depositor", address: USER, sign: async (x) => x });
  const before = await client.assetValueOf(USER, "EUR");
  await bridge().compound("EUR", "10");
  expect(await client.assetValueOf(USER, "EUR")).toBeGreaterThan(before);
});

test("freeze pauses the active pool", async () => {
  const k = bridge();
  await k.allocate("EUR", "500");
  await k.freeze("EUR");
  expect(await client.poolStatus(SEED_POOLS.EUR)).toBe("frozen");
});

test("proposeExit targets the bucket's safe pool", async () => {
  const k = bridge();
  await k.allocate("EUR", "500");
  await k.freeze("EUR");
  await k.proposeExit("EUR");
  const proposal = await client.pendingExit("EUR");
  expect(proposal?.fromPool).toBe(SEED_POOLS.EUR);
  expect(proposal?.toPool).toBe(SEED_SAFE_EXIT.EUR);
});

test("rebalance moves the active pool and leaves no proposal to approve", async () => {
  const k = bridge();
  await k.allocate("USD", "1000");
  await k.rebalance("USD", "1000");
  expect(await client.activePool("USD")).not.toBe(SEED_POOLS.USD);
  expect(await client.pendingExit("USD")).toBeNull();
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm -C frontend test -- bridge`
Expected: FAIL — `Failed to resolve import "../bridge"`.

- [ ] **Step 3: Write the bridge**

Create `frontend/lib/e2e/bridge.ts`:

```ts
import { mockSigner, type Currency, type MockVaultClient } from "@sorosense/vault-client";
import { SEED_POOLS, SEED_SAFE_EXIT } from "../vault/seed";
import { toAmount } from "../vault/units";

/** Inlined by Next at build time, so every branch guarded by this is dead in production. */
export const E2E = process.env.NEXT_PUBLIC_E2E === "1";

export type KeeperAction = "allocate" | "compound" | "freeze" | "proposeExit" | "rebalance";

/**
 * The keeper/Sentinel actions a Playwright spec drives. Amounts are decimal strings, not `bigint`:
 * `page.evaluate` cannot serialize a bigint across the Node↔browser boundary. Every action calls
 * `bump()` so the React tree re-reads the mock.
 */
export type KeeperBridge = Record<KeeperAction, (currency: Currency, amount: string) => Promise<void>>;

/** Where a rebalance lands. Never a frozen pool, and never one carrying an exit proposal. */
const REBALANCE_TARGET: Record<Currency, string> = {
  USD: "pool-blend-usd",
  EUR: "pool-defindex-eur",
  MXN: "pool-blend-mxn",
};

export function createKeeperBridge(client: MockVaultClient, bump: () => void): KeeperBridge {
  const keeper = mockSigner("keeper");
  // Before the first allocate a bucket has no active pool; the seed's pool id is its natural home.
  const activePool = async (c: Currency): Promise<string> => (await client.activePool(c)) ?? SEED_POOLS[c];

  return {
    async allocate(currency, amount) {
      await client.allocate(SEED_POOLS[currency], currency, toAmount(amount)).signAndSubmit(keeper);
      bump();
    },
    async compound(currency, amount) {
      // Yield, not a vault operation: NAV rises, no shares are minted. Mirrors the agent compounding.
      client.simulateYield(currency, toAmount(amount));
      bump();
    },
    async freeze(currency) {
      await client.freeze(await activePool(currency)).signAndSubmit(keeper);
      bump();
    },
    async proposeExit(currency) {
      const from = await activePool(currency);
      await client.proposeExit(currency, from, SEED_SAFE_EXIT[currency]).signAndSubmit(keeper);
      bump();
    },
    async rebalance(currency, amount) {
      // A rebalance moves funds between healthy pools. It never proposes, and never asks the user.
      const from = await activePool(currency);
      const amt = toAmount(amount);
      await client.deallocate(from, currency, amt).signAndSubmit(keeper);
      await client.allocate(REBALANCE_TARGET[currency], currency, amt).signAndSubmit(keeper);
      bump();
    },
  };
}

declare global {
  interface Window {
    __sorosense__?: { keeper: KeeperBridge };
  }
}

/** No-op unless the e2e flag is on, so production never grows a `window` handle onto the vault. */
export function installE2EBridge(client: MockVaultClient, bump: () => void): void {
  if (!E2E || typeof window === "undefined") return;
  window.__sorosense__ = { keeper: createKeeperBridge(client, bump) };
}
```

Note `rebalance` on EUR deliberately targets `pool-defindex-eur`, the same pool `SEED_SAFE_EXIT.EUR` names: a rebalance and a safe exit can land in the same healthy pool — what separates them is that only the exit asks the user first.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm -C frontend test -- bridge`
Expected: PASS, 5 tests.

- [ ] **Step 5: Wire it into `VaultProvider` and turn the seed off**

Replace the effect block in `frontend/providers/VaultProvider.tsx` (lines 24-32) and add the import:

```tsx
import { E2E, installE2EBridge } from "../lib/e2e/bridge";
```

```tsx
  useEffect(() => {
    // Under e2e the vault starts empty: the spec drives allocate/freeze/proposeExit through the
    // keeper bridge, so every state change has a visible cause instead of arriving pre-seeded.
    // It is also the only way to reach Earn's empty state (where <Simulator> lives) while connected.
    if (!address || E2E) return;
    let cancelled = false;
    // Dev-only seed; a no-op once the bucket is funded. Replaced by real reads at U20.
    void seedVault(resolvedClient, address).then(() => {
      if (!cancelled) setVersion((n) => n + 1);
    });
    return () => { cancelled = true; };
  }, [address, resolvedClient]);

  useEffect(() => {
    installE2EBridge(resolvedClient, bump);
  }, [resolvedClient, bump]);
```

`bump` is declared below the effects today; move the `const bump = useCallback(...)` line above them so it is defined before use.

- [ ] **Step 6: Run the provider's unit tests**

Run: `pnpm -C frontend test -- VaultProvider`
Expected: PASS. `E2E` is `false` under vitest, so seeding behaviour is unchanged.

- [ ] **Step 7: Write the spec-side helper**

Create `frontend/e2e/support/bridge.ts`:

```ts
import type { Page } from "@playwright/test";
import type { Currency } from "@sorosense/vault-client";
import type { KeeperAction } from "../../lib/e2e/bridge";

/**
 * Drive the keeper (the "backend stub" the ticket names) from a spec. Waits for VaultProvider's
 * effect to install the bridge before calling — the handle appears one tick after hydration.
 */
export async function keeper(
  page: Page,
  action: KeeperAction,
  currency: Currency,
  amount = "0",
): Promise<void> {
  await page.waitForFunction(() => !!window.__sorosense__);
  await page.evaluate(
    async ([a, c, amt]) => {
      const bridge = window.__sorosense__;
      if (!bridge) throw new Error("e2e keeper bridge is not installed");
      await bridge.keeper[a](c, amt);
    },
    [action, currency, amount] as const,
  );
}
```

- [ ] **Step 8: Prove the empty Earn state is reachable**

Append to `frontend/e2e/smoke.spec.ts`:

```ts
test("a connected wallet still sees the empty Earn state, because e2e does not seed", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Connect wallet" }).click();
  await page.getByRole("link", { name: "Earn" }).click();

  await expect(page.getByTestId("earn-balance")).toHaveText("$0.00");
  await expect(page.getByText("Simulate earnings")).toBeVisible();
});
```

- [ ] **Step 9: Run it**

Run: `pnpm e2e`
Expected: PASS, 2 tests. Before Task 3 this test would have shown the funded hero.

- [ ] **Step 10: Typecheck, lint, full unit suite**

Run: `pnpm -r typecheck && pnpm -C frontend lint && pnpm -r test`
Expected: all clean.

- [ ] **Step 11: Commit**

```bash
git add frontend/lib/e2e frontend/providers/VaultProvider.tsx frontend/e2e
git commit -m "test(U17): the test is the keeper, so the dev seed steps aside (STE-27)"
```

---

### Task 4: The demo journey

**Files:**
- Create: `frontend/e2e/support/journey.ts`
- Create: `frontend/e2e/demo-flow.spec.ts`
- Delete: `frontend/e2e/smoke.spec.ts` (its two assertions are absorbed by the journey)

**Interfaces:**
- Consumes: `keeper()` (Task 3), `E2E_ADDRESS` (Task 2).
- Produces: `e2e/support/journey.ts` exports `connectWallet(page: Page): Promise<void>` and `depositEurc(page: Page, amount: string): Promise<void>`, both used again by Task 5.

- [ ] **Step 1: Write the shared steps**

Create `frontend/e2e/support/journey.ts`:

```ts
import { expect, type Page } from "@playwright/test";

/** Land on the app with a stubbed wallet connected. The stub signs without a popup. */
export async function connectWallet(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "Connect wallet" }).click();
  await expect(page).toHaveURL(/\/home$/);
}

/**
 * Deposit `amount` EURC through the real UI: keypad → "Deposit fund" → the one-time consent
 * mandate. The e2e vault starts empty and `seedVault` never granted consent anyway, so the very
 * first deposit is what surfaces the ConsentSheet.
 */
export async function depositEurc(page: Page, amount: string): Promise<void> {
  await page.goto("/deposit/eurc");
  for (const digit of amount) {
    // `exact` matters: accessible-name matching is substring-based, so a bare "0" would also
    // match the "10%" and "50%" quick-fill buttons sitting above the keypad.
    await page.getByRole("button", { name: digit, exact: true }).click();
  }
  await expect(page.getByTestId("keypad-value")).toHaveText(amount);
  await page.getByRole("button", { name: "Deposit fund" }).click();

  const consent = page.getByRole("dialog", { name: "Approve automatic earning" });
  await expect(consent).toBeVisible();
  await consent.getByRole("button", { name: "Agree & sign" }).click();

  await expect(page).toHaveURL(/\/home$/);
}
```

- [ ] **Step 2: Write the journey spec**

Create `frontend/e2e/demo-flow.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { keeper } from "./support/bridge";
import { connectWallet, depositEurc } from "./support/journey";

test("the demo journey: connect → simulate → deposit → agent works → approve a safe exit", async ({ page }) => {
  // 1. Connect. Freighter is stubbed at the lib/wallet.ts seam (NEXT_PUBLIC_E2E).
  await connectWallet(page);

  // 2. Earn is empty, so the deterministic simulator is on screen (R15). It is the only
  //    AI-adjacent surface in the app: math, not a chatbot.
  await page.getByRole("link", { name: "Earn" }).click();
  await expect(page.getByTestId("earn-balance")).toHaveText("$0.00");

  // 3. The projection responds to the amount and to the horizon.
  await expect(page.getByTestId("amount")).toHaveText("$1,000");
  const yearly = await page.getByTestId("projection").textContent();
  await page.getByRole("button", { name: "Increase" }).click();
  await expect(page.getByTestId("amount")).toHaveText("$1,500");
  await expect(page.getByTestId("projection")).not.toHaveText(yearly ?? "");

  await page.getByRole("button", { name: "Month" }).click();
  const monthly = await page.getByTestId("projection").textContent();
  expect(monthly).not.toBe(yearly);

  // 4. Deposit EURC through the consent sheet — the one-time auto-optimize mandate.
  await depositEurc(page, "500");
  await expect(page.getByText("Deposited. Agent is allocating.")).toBeVisible();
  await expect(page.getByText("EUR bucket")).toBeVisible();

  // 5. The agent allocates and compounds. No approval is asked for either.
  //    Home renders only `activity.slice(0, 3)` (home/page.tsx:36), so the auto-allocate row lives
  //    one screen deeper. Note the rows come from a fixture (hooks/useActivity.ts, see STE-42) —
  //    what is under test is that the agent's work is *shown*, never that it asks.
  await keeper(page, "allocate", "EUR", "500");
  await keeper(page, "compound", "EUR", "12");
  await expect(page.getByText(/^Reinvested rewards/)).toBeVisible();

  await page.getByRole("button", { name: "View all activity" }).click();
  await expect(page).toHaveURL(/\/account\/activity$/);
  await expect(page.getByText("Allocated to Blend USDC")).toBeVisible();
  await expect(page.getByText(/^Reinvested rewards/)).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/home$/);

  // 6. The Sentinel pauses the pool. Freezing moves nothing — it only protects.
  await keeper(page, "freeze", "EUR");
  const banner = page.getByRole("button", { name: "Review paused pool" });
  await expect(banner).toBeVisible();

  // 7. Before a proposal exists the sheet can only say it is preparing one.
  await banner.click();
  const exit = page.getByRole("dialog", { name: "Approve safe exit" });
  await expect(exit.getByText("Preparing your safe exit.")).toBeVisible();

  // 8. The proposal arrives. Only now is the user asked — moving funds always needs a signature.
  await keeper(page, "proposeExit", "EUR");
  await expect(exit.getByText("DeFindex EURC")).toBeVisible();
  await exit.getByRole("button", { name: "Approve and sign in wallet" }).click();

  // 9. Approved: the banner clears, and the exit's "Review" affordance dies into a "Reviewed" pill.
  //    That pill hangs off the `proposed-exit` row, which is 4th in the feed — so it is on the
  //    Activity screen, not on Home's three-row preview.
  await expect(page.getByText("Exit approved. Moving your funds now.")).toBeVisible();
  await expect(banner).toBeHidden();

  await page.goto("/account/activity");
  await expect(page.getByText("Reviewed")).toBeVisible();
  await expect(page.getByRole("button", { name: "Review", exact: true })).toHaveCount(0);
});
```

- [ ] **Step 3: Delete the smoke spec**

```bash
git rm frontend/e2e/smoke.spec.ts
```

- [ ] **Step 4: Run it**

Run: `pnpm e2e`
Expected: PASS, 1 test. If step 3's keypad assertion fails, check `components/ui/Keypad.tsx:32` — the digit buttons carry their digit as their accessible name, which is why `exact: true` matters (`"5"` must not match `"500"` elsewhere on the page).

- [ ] **Step 5: Typecheck and lint**

Run: `pnpm -r typecheck && pnpm -C frontend lint`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add frontend/e2e
git commit -m "test(U17): the demo journey, from an empty vault to an approved safe exit (STE-27)"
```

---

### Task 5: The two invariants

**Files:**
- Modify: `frontend/e2e/demo-flow.spec.ts` (append two tests)

**Interfaces:**
- Consumes: `connectWallet`, `depositEurc` (Task 4), `keeper` (Task 3).
- Produces: nothing downstream.

- [ ] **Step 1: Write the "no risk label" test**

Append to `frontend/e2e/demo-flow.spec.ts`:

```ts
/**
 * Safety is invisible (R11). No surface may name a risk, a tier, or a score — not in a label, not in
 * body copy. `safety` is deliberately absent from the pattern: "Paused EURC pool for safety" is the
 * agent explaining an action, not a rating of the user's money.
 */
const RISK_WORDS = /\b(risk|risks|risky|tier|tiers|score|scores)\b/i;

const SURFACES = [
  "/",
  "/home",
  "/earn",
  "/add-funds",
  "/deposit/eurc",
  "/withdraw",
  "/account",
  "/account/activity",
] as const;

test("no user surface exposes a risk label, tier, or score", async ({ page }) => {
  await connectWallet(page);
  await depositEurc(page, "500");
  await keeper(page, "allocate", "EUR", "500");
  await keeper(page, "freeze", "EUR");
  await keeper(page, "proposeExit", "EUR"); // the amber/paused surfaces are the likeliest to slip

  for (const surface of SURFACES) {
    await page.goto(surface);
    const text = await page.locator("body").innerText();
    expect(text, `risk wording on ${surface}`).not.toMatch(RISK_WORDS);
  }
});
```

- [ ] **Step 2: Run it**

Run: `pnpm e2e -- --grep "risk label"`
Expected: PASS. A failure names the offending surface.

- [ ] **Step 3: Write the "rebalance never asks" test**

Append to `frontend/e2e/demo-flow.spec.ts`:

```ts
/**
 * A rebalance moves funds between healthy pools under the standing mandate; a safe exit moves them
 * out of a paused one. Only the second may ask. This asserts the first never does.
 *
 * `BottomSheet` renders `role="dialog"` even while closed (aria-hidden="true"), so a raw
 * `[role=dialog]` locator would always match. `getByRole` skips aria-hidden subtrees — that is the
 * distinction being tested.
 */
test("a rebalance never asks the user to approve anything", async ({ page }) => {
  await connectWallet(page);
  await depositEurc(page, "500");
  await keeper(page, "allocate", "USD", "1000");

  await keeper(page, "rebalance", "USD", "1000");

  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /approve/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Review paused pool" })).toHaveCount(0);

  // The rebalance still surfaces as agent activity — visible, just never blocking. The row carries
  // no "Review" affordance; only `proposed-exit` ever does (components/activity/ActivityRow.tsx:12).
  await expect(page.getByText(/^Switched to DeFindex/)).toBeVisible();
  await page.goto("/account/activity");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Review", exact: true })).toHaveCount(0);
});
```

- [ ] **Step 4: Run the whole suite**

Run: `pnpm e2e`
Expected: PASS, 3 tests.

- [ ] **Step 5: Typecheck, lint, unit suite**

Run: `pnpm -r typecheck && pnpm -C frontend lint && pnpm -r test`
Expected: all clean.

- [ ] **Step 6: Commit**

```bash
git add frontend/e2e/demo-flow.spec.ts
git commit -m "test(U17): safety stays invisible and only a safe exit may ask (STE-27)"
```

---

### Task 6: Evidence and PR

**Files:**
- Create: `docs/tests/linear-STE-27/e2e-evidence.md`
- Create: `docs/tests/linear-STE-27/screenshots/` (captured during the run)
- Modify: `frontend/e2e/support/journey.ts` (add the `shot()` helper)

**Interfaces:**
- Consumes: everything above.
- Produces: `shot(page: Page, name: string): Promise<void>` — writes `docs/tests/linear-STE-27/screenshots/<name>.png`, but only when `E2E_EVIDENCE=1`, so an ordinary `pnpm e2e` never dirties the working tree.

- [ ] **Step 1: Add the evidence helper**

Append to `frontend/e2e/support/journey.ts`:

```ts
import path from "node:path";

const EVIDENCE_DIR = path.join("..", "docs", "tests", "linear-STE-27", "screenshots");

/** Capture PR evidence. Opt-in (`E2E_EVIDENCE=1`) so a normal run leaves the working tree clean. */
export async function shot(page: Page, name: string): Promise<void> {
  if (process.env.E2E_EVIDENCE !== "1") return;
  await page.screenshot({ path: path.join(EVIDENCE_DIR, `${name}.png`) });
}
```

- [ ] **Step 2: Capture the journey**

In `frontend/e2e/demo-flow.spec.ts`, import `shot` alongside `connectWallet`, and add a call after each numbered milestone of the journey test: `01-earn-empty-simulator`, `02-consent-sheet` (before clicking "Agree & sign"), `03-home-funded`, `04-activity-rows`, `05-freeze-banner`, `06-exit-approval`, `07-exit-approved`. The consent shot needs the sheet on screen, so take it inside `depositEurc` — pass the page through: add `await shot(page, "02-consent-sheet");` immediately after `await expect(consent).toBeVisible();`.

- [ ] **Step 3: Produce the evidence**

Run:
```bash
E2E_EVIDENCE=1 pnpm e2e 2>&1 | tee /tmp/u17-e2e.txt
```
(PowerShell: `$env:E2E_EVIDENCE="1"; pnpm e2e`)
Expected: `3 passed`. Seven PNGs land in `docs/tests/linear-STE-27/screenshots/`.

- [ ] **Step 4: Write `docs/tests/linear-STE-27/e2e-evidence.md`**

Follow the shape of `docs/tests/linear-STE-26/e2e-evidence.md`: a `## Summary` of what U17 added, then `## E2E evidence` with a `<details><summary>Dev browser verification</summary>` block naming the branch, the commit, the command, and each screenshot with a sentence on what it proves. State plainly that the wallet is stubbed and that the keeper actions come from the test, not from a seed. Paste the green `pnpm e2e` output.

- [ ] **Step 5: Final green gate**

Run: `pnpm -r typecheck && pnpm -C frontend lint && pnpm -r test && pnpm e2e`
Expected: all four green. Report any failure verbatim rather than working around it.

- [ ] **Step 6: Commit and open the PR**

```bash
git add docs/tests/linear-STE-27 frontend/e2e
git commit -m "docs(U17): e2e evidence — the demo journey, green under Playwright (STE-27)"
git push -u origin AncungAulia/ancungaulia-ste-27-u17-frontend-e2e-tests-wiring
```

Open the PR with the `pr-e2e-evidence` template, body drawn from `docs/tests/linear-STE-27/e2e-evidence.md`. Link STE-27. Leave the ticket **In Progress** until merge — this team's Linear has no "In Review" status.
