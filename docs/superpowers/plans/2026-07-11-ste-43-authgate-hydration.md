# STE-43 AuthGate Hydration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop AuthGate from bouncing hard-loaded gated routes to `/`, and forward a returning user with a stored session straight into the app — by hydrating the wallet before AuthGate decides, and re-verifying the restored session against the live wallet.

**Architecture:** `WalletProvider` becomes the single hydration point: `address` is tri-state (`undefined` = not read, `null` = disconnected, `string` = verified live). On mount it reads `localStorage`, and if a session is stored it re-verifies via `getAddress()`, clearing state on mismatch. `AuthGate` and the landing page (`/`) then only react to `hydrated`/`isConnected`. The e2e wallet stub is made to survive reloads so the verification doesn't false-negative under Playwright.

**Tech Stack:** Next 16 (App Router), React 19, TypeScript strict (`noUncheckedIndexedAccess`), Vitest + Testing Library (jsdom), Playwright (port 3100, `NEXT_PUBLIC_E2E=1`).

## Global Constraints

- All wallet code is client-only (`"use client"` + `useEffect`), never module scope — no `window is not defined` / hydration mismatch (KTD7).
- Safety invisible — no `risk`/`tier`/`score` field or label on any user surface.
- Per-currency buckets, never converted; blending to USD is display-only.
- `KEEPER_SECRET` is backend-only; no secret reaches the client.
- Typecheck is a hard gate: `pnpm -r typecheck` with `noUncheckedIndexedAccess`; run it, not just tests.
- e2e never uses port 3000 or `reuseExistingServer`; Playwright owns port 3100.
- Linear team `sorosense` has no "In Review" status — use In Progress until merge.
- `address` on the wallet context is now `string | null | undefined`; every consumer already guards with `if (!address)`, which also covers `undefined` — do not remove those guards.

---

## File map

- `frontend/lib/wallet-e2e.ts` — **modify** — connection marker moves from module scope to `localStorage` so it survives reloads (Task 2).
- `frontend/providers/WalletProvider.tsx` — **modify** — tri-state `address`, async hydration with `getAddress()` re-verification, derived `hydrated`/`isConnected` (Task 3).
- `frontend/components/AuthGate.tsx` — **modify** — hold redirect until `hydrated`; render `null` while deciding/redirecting (Task 4).
- `frontend/app/page.tsx` — **modify** — auto-forward to `/home` after hydration when a session exists (Task 5).
- `frontend/e2e/authgate-deep-link.spec.ts` — **create** — the two proof specs (Task 1 red, Task 6 green).
- `frontend/e2e/support/journey.ts` — **modify** — drop the STE-43 comment; make `connectWallet()` tolerant of auto-forward; evaluate `goBackTo()` (Task 7).
- Tests: `frontend/providers/__tests__/WalletProvider.test.tsx`, `frontend/components/__tests__/AuthGate.test.tsx`, `frontend/app/__tests__/page.test.tsx` (create), `frontend/lib/__tests__/wallet-e2e.test.ts` (unchanged, re-run).

---

### Task 1: Failing e2e proof (red first)

Write the two specs that encode the bug. They must FAIL against current `main` — that is the proof the bug exists. Do **not** touch production code in this task.

**Files:**
- Create: `frontend/e2e/authgate-deep-link.spec.ts`

**Interfaces:**
- Consumes: `connectWallet(page)` from `frontend/e2e/support/journey.ts` (existing: `goto("/")` → click "Connect wallet" → assert `/home`).
- Produces: nothing consumed by later tasks; Task 6 re-runs this file green.

- [ ] **Step 1: Write the failing specs**

```ts
// frontend/e2e/authgate-deep-link.spec.ts
import { expect, test } from "@playwright/test";
import { connectWallet } from "./support/journey";

/**
 * STE-43. React runs effects child → parent, so on a hard load AuthGate's effect
 * decided "disconnected" before WalletProvider hydrated `address`. A deep link to a
 * gated route bounced to `/`; a returning user was forced back through onboarding.
 * These two specs pin both symptoms.
 */

test("a hard load of a gated route keeps a stored session on that route", async ({ page }) => {
  await connectWallet(page); // stores soro.wallet in this context

  await page.goto("/home");
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByRole("navigation")).toBeVisible(); // the app shell, not the landing

  // A deeper gated route survives a hard load too.
  await page.goto("/account");
  await expect(page).toHaveURL(/\/account$/);
});

test("landing forwards a stored session to /home without a second connect", async ({ page }) => {
  await connectWallet(page);

  await page.goto("/");
  await expect(page).toHaveURL(/\/home$/);
  // Proof it was the auto-forward, not us clicking through onboarding again.
  await expect(page.getByRole("button", { name: "Connect wallet" })).toHaveCount(0);
});
```

- [ ] **Step 2: Run and verify RED**

Run: `pnpm --dir frontend exec playwright test authgate-deep-link --reporter=list`
Expected: both tests FAIL — the first because `goto("/home")` bounces to `/` (URL assertion fails), the second because `goto("/")` shows the landing with a "Connect wallet" button. (Playwright starts its own server on 3100; first run may download the browser — allow time.)

> If `connectWallet` itself times out here, that is the current stub's module-scope connection NOT surviving the `goto("/home")` reload — which is the same class of failure Task 2 fixes. Note it and proceed; Task 6 confirms green after the full fix.

- [ ] **Step 3: Commit the red spec**

```bash
git add frontend/e2e/authgate-deep-link.spec.ts
git commit -m "test(STE-43): failing e2e for deep-link bounce + no auto-forward"
```

---

### Task 2: e2e wallet stub survives reloads (Danger #2)

`let connected` in module scope resets on every hard load; real Freighter does not. Move the flag into `localStorage` so `getAddress()` verification (added in Task 3) doesn't false-negative under Playwright.

**Files:**
- Modify: `frontend/lib/wallet-e2e.ts`
- Test: `frontend/lib/__tests__/wallet-e2e.test.ts` (unchanged — must still pass)

**Interfaces:**
- Produces: `connect()/disconnect()/getAddress()/signTransaction()` keep their signatures; connection state is now `localStorage["soro.e2e.connected"] === "1"`, client-guarded.

- [ ] **Step 1: Replace the module-scope flag with a localStorage marker**

Replace lines 17-40 of `frontend/lib/wallet-e2e.ts` (from `let connected = false;` through the end) with:

```ts
// Real Freighter keeps its connection in the extension, alive across page reloads. This stub must
// mirror that: a module-scope flag would reset on every hard load, so getAddress() verification
// (WalletProvider hydration, STE-43) would false-negative and bounce every e2e deep load. Persist
// the connection in localStorage instead. Client-only, like the real wallet.
const CONNECTED_KEY = "soro.e2e.connected";

function isConnected(): boolean {
  return typeof window !== "undefined" && window.localStorage.getItem(CONNECTED_KEY) === "1";
}

function requireConnected(): void {
  if (!isConnected()) throw new Error("no e2e wallet connected");
}

export async function connect(): Promise<{ address: string; name: string }> {
  if (typeof window !== "undefined") window.localStorage.setItem(CONNECTED_KEY, "1");
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
  if (typeof window !== "undefined") window.localStorage.removeItem(CONNECTED_KEY);
}
```

- [ ] **Step 2: Run the stub's unit tests**

Run: `pnpm --dir frontend exec vitest run lib/__tests__/wallet-e2e.test.ts`
Expected: PASS (5 tests). `beforeEach` calls `disconnect()` (clears the marker), so `getAddress()` still throws before `connect()`; jsdom provides `localStorage`.

- [ ] **Step 3: Typecheck**

Run: `pnpm -C frontend typecheck`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add frontend/lib/wallet-e2e.ts
git commit -m "test(STE-43): e2e wallet stub persists connection across reloads"
```

---

### Task 3: WalletProvider tri-state hydration + re-verification (the core)

**Files:**
- Modify: `frontend/providers/WalletProvider.tsx`
- Test: `frontend/providers/__tests__/WalletProvider.test.tsx`

**Interfaces:**
- Consumes: `wallet.getAddress()` from `frontend/lib/wallet.ts` (re-exports the e2e/real seam).
- Produces: `WalletContext` value `{ address: string | null | undefined, walletName: string | null, hydrated: boolean, isConnected: boolean, connect, disconnect, signTransaction }`. `hydrated === (address !== undefined)`; `isConnected === !!address`. Consumed by AuthGate (Task 4) and the landing (Task 5).

- [ ] **Step 1: Write the failing tests**

Replace `frontend/providers/__tests__/WalletProvider.test.tsx` with the version below. It adds `getAddress` to the wallet mock and the `Probe` now surfaces `hydrated`. The three surviving tests keep their intent; three new ones cover the tri-state and re-verification.

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WalletProvider } from "../WalletProvider";
import { useWallet } from "../../hooks/useWallet";
import * as wallet from "../../lib/wallet";

vi.mock("../../lib/wallet", () => ({
  connect: vi.fn(async () => ({ address: "GABC123", name: "Freighter" })),
  disconnect: vi.fn(async () => {}),
  signTransaction: vi.fn(async () => "SIGNED"),
  getAddress: vi.fn(async () => "GXYZ789"),
}));

function Probe() {
  const { address, walletName, hydrated, isConnected, connect, disconnect } = useWallet();
  return (
    <div>
      <span data-testid="addr">{address ?? "none"}</span>
      <span data-testid="walletName">{walletName ?? ""}</span>
      <span data-testid="hydrated">{String(hydrated)}</span>
      <span data-testid="flag">{String(isConnected)}</span>
      <button onClick={() => connect()}>connect</button>
      <button onClick={() => disconnect()}>disconnect</button>
    </div>
  );
}

afterEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

test("connect sets address + isConnected", async () => {
  render(<WalletProvider><Probe /></WalletProvider>);
  expect(await screen.findByText("none")).toBeInTheDocument(); // hydrated, no session
  await userEvent.click(screen.getByRole("button", { name: "connect" }));
  expect(await screen.findByText("GABC123")).toBeInTheDocument();
  expect(screen.getByTestId("flag").textContent).toBe("true");
});

test("hydration with no stored session ends disconnected but hydrated", async () => {
  render(<WalletProvider><Probe /></WalletProvider>);
  await waitFor(() => expect(screen.getByTestId("hydrated").textContent).toBe("true"));
  expect(screen.getByTestId("addr").textContent).toBe("none");
  expect(screen.getByTestId("flag").textContent).toBe("false");
});

test("restores a stored session only after getAddress() confirms it", async () => {
  localStorage.setItem("soro.wallet", "GXYZ789");
  localStorage.setItem("soro.wallet.name", "Freighter");
  render(<WalletProvider><Probe /></WalletProvider>);
  expect(await screen.findByText("GXYZ789")).toBeInTheDocument();
  expect(screen.getByTestId("flag").textContent).toBe("true");
  expect(screen.getByTestId("walletName").textContent).toBe("Freighter");
  expect(wallet.getAddress).toHaveBeenCalledTimes(1);
});

test("clears a stale session when getAddress() disagrees", async () => {
  vi.mocked(wallet.getAddress).mockResolvedValueOnce("GDIFFERENT");
  localStorage.setItem("soro.wallet", "GXYZ789");
  localStorage.setItem("soro.wallet.name", "Freighter");
  render(<WalletProvider><Probe /></WalletProvider>);
  await waitFor(() => expect(screen.getByTestId("hydrated").textContent).toBe("true"));
  expect(screen.getByTestId("addr").textContent).toBe("none");
  expect(screen.getByTestId("flag").textContent).toBe("false");
  expect(localStorage.getItem("soro.wallet")).toBeNull();
  expect(localStorage.getItem("soro.wallet.name")).toBeNull();
});

test("clears a stored session when the wallet is locked (getAddress throws)", async () => {
  vi.mocked(wallet.getAddress).mockRejectedValueOnce(new Error("locked"));
  localStorage.setItem("soro.wallet", "GXYZ789");
  render(<WalletProvider><Probe /></WalletProvider>);
  await waitFor(() => expect(screen.getByTestId("hydrated").textContent).toBe("true"));
  expect(screen.getByTestId("addr").textContent).toBe("none");
  expect(localStorage.getItem("soro.wallet")).toBeNull();
});

test("disconnect clears address + isConnected + localStorage", async () => {
  render(<WalletProvider><Probe /></WalletProvider>);
  await userEvent.click(screen.getByRole("button", { name: "connect" }));
  expect(await screen.findByText("GABC123")).toBeInTheDocument();
  expect(localStorage.getItem("soro.wallet")).toBe("GABC123");
  await userEvent.click(screen.getByRole("button", { name: "disconnect" }));
  expect(await screen.findByText("none")).toBeInTheDocument();
  expect(screen.getByTestId("flag").textContent).toBe("false");
  expect(localStorage.getItem("soro.wallet")).toBeNull();
  expect(localStorage.getItem("soro.wallet.name")).toBeNull();
});

test("exposes and persists the wallet name across a remount", async () => {
  const user = userEvent.setup();
  const { unmount } = render(<WalletProvider><Probe /></WalletProvider>);
  await user.click(screen.getByText("connect"));
  await waitFor(() => expect(screen.getByTestId("walletName").textContent).toBe("Freighter"));
  unmount();
  render(<WalletProvider><Probe /></WalletProvider>);
  await waitFor(() => expect(screen.getByTestId("walletName").textContent).toBe("Freighter"));
});
```

- [ ] **Step 2: Run and verify RED**

Run: `pnpm --dir frontend exec vitest run providers/__tests__/WalletProvider.test.tsx`
Expected: FAIL — `hydrated` is undefined (no such context field yet) and the re-verification tests fail because hydration is synchronous and never calls `getAddress`.

- [ ] **Step 3: Implement tri-state hydration**

Replace `frontend/providers/WalletProvider.tsx` with:

```tsx
"use client";
import { createContext, useCallback, useEffect, useState, type ReactNode } from "react";
import * as wallet from "../lib/wallet";

type Ctx = {
  // undefined = not hydrated yet (localStorage not read); null = definitively
  // disconnected; string = a re-verified live session. `hydrated`/`isConnected`
  // are derived from it so consumers never re-derive the tri-state by hand.
  address: string | null | undefined;
  walletName: string | null;
  hydrated: boolean;
  isConnected: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  signTransaction: (xdr: string) => Promise<string>;
};
export const WalletContext = createContext<Ctx | null>(null);
const KEY = "soro.wallet";
const NAME_KEY = "soro.wallet.name";

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null | undefined>(undefined);
  const [walletName, setWalletName] = useState<string | null>(null);

  // One-time hydration on mount. Reading storage during render (lazy useState init) is not
  // SSR-safe and would cause a hydration mismatch, so this runs in an effect. The restored
  // address is re-verified against the live wallet before we trust it: a previously-saved
  // address is not a live session (the user may have revoked, locked, or switched accounts),
  // so entering the app on it would only fail later, at signing time. Verify, then trust.
  useEffect(() => {
    let alive = true;
    void (async () => {
      const saved = window.localStorage.getItem(KEY);
      if (!saved) {
        if (alive) setAddress(null);
        return;
      }
      try {
        const live = await wallet.getAddress();
        if (!alive) return;
        if (live === saved) {
          setAddress(saved);
          // The kit does not persist the selected wallet id across reloads, so getWalletName()
          // would lie and say "Freighter"; the name captured at connect time is the only truthful
          // source for a restored session.
          setWalletName(window.localStorage.getItem(NAME_KEY));
          return;
        }
      } catch {
        // locked / revoked / no permission — fall through to clear.
      }
      if (!alive) return;
      window.localStorage.removeItem(KEY);
      window.localStorage.removeItem(NAME_KEY);
      setAddress(null);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const connect = useCallback(async () => {
    const { address: addr, name } = await wallet.connect();
    setAddress(addr);
    setWalletName(name);
    window.localStorage.setItem(KEY, addr);
    window.localStorage.setItem(NAME_KEY, name);
  }, []);

  const disconnect = useCallback(async () => {
    await wallet.disconnect();
    setAddress(null);
    setWalletName(null);
    window.localStorage.removeItem(KEY);
    window.localStorage.removeItem(NAME_KEY);
  }, []);

  return (
    <WalletContext.Provider
      value={{
        address,
        walletName,
        hydrated: address !== undefined,
        isConnected: !!address,
        connect,
        disconnect,
        signTransaction: wallet.signTransaction,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}
```

- [ ] **Step 4: Run and verify GREEN**

Run: `pnpm --dir frontend exec vitest run providers/__tests__/WalletProvider.test.tsx`
Expected: PASS (7 tests).

- [ ] **Step 5: Typecheck the whole workspace**

Run: `pnpm -r typecheck`
Expected: clean. The `address` type is now `string | null | undefined`; every consumer already guards with `if (!address)` so `undefined` narrows away — no consumer edit needed.

- [ ] **Step 6: Commit**

```bash
git add frontend/providers/WalletProvider.tsx frontend/providers/__tests__/WalletProvider.test.tsx
git commit -m "fix(STE-43): tri-state wallet hydration with getAddress re-verification"
```

---

### Task 4: AuthGate holds the redirect until hydration

**Files:**
- Modify: `frontend/components/AuthGate.tsx`
- Test: `frontend/components/__tests__/AuthGate.test.tsx`

**Interfaces:**
- Consumes: `useWallet()` → `{ isConnected, hydrated }` (from Task 3).
- Produces: no exported change; renders `null` until `hydrated`, then children or a `router.push("/")`.

- [ ] **Step 1: Write the failing tests**

Replace `frontend/components/__tests__/AuthGate.test.tsx` with:

```tsx
import { render, screen } from "@testing-library/react";
import { AuthGate } from "../AuthGate";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
const useWallet = vi.fn();
vi.mock("../../hooks/useWallet", () => ({ useWallet: () => useWallet() }));

afterEach(() => vi.clearAllMocks());

test("renders children when hydrated and connected", () => {
  useWallet.mockReturnValue({ hydrated: true, isConnected: true });
  render(<AuthGate><p>gated</p></AuthGate>);
  expect(screen.getByText("gated")).toBeInTheDocument();
  expect(push).not.toHaveBeenCalled();
});

test("waits during hydration: no redirect, no children", () => {
  useWallet.mockReturnValue({ hydrated: false, isConnected: false });
  render(<AuthGate><p>gated</p></AuthGate>);
  expect(screen.queryByText("gated")).not.toBeInTheDocument();
  expect(push).not.toHaveBeenCalled();
});

test("redirects to / when hydrated and disconnected", () => {
  useWallet.mockReturnValue({ hydrated: true, isConnected: false });
  render(<AuthGate><p>gated</p></AuthGate>);
  expect(push).toHaveBeenCalledWith("/");
  expect(screen.queryByText("gated")).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run and verify RED**

Run: `pnpm --dir frontend exec vitest run components/__tests__/AuthGate.test.tsx`
Expected: FAIL — the "waits during hydration" test currently redirects (old AuthGate pushes whenever `!isConnected`), and children render unconditionally.

- [ ] **Step 3: Implement the gate**

Replace `frontend/components/AuthGate.tsx` with:

```tsx
"use client";
import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "../hooks/useWallet";

export function AuthGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { isConnected, hydrated } = useWallet();
  // Wait for WalletProvider to hydrate before deciding. React runs child effects before parent
  // ones, so on a hard load `address` is still undefined here on the first pass — redirecting then
  // would bounce a valid session out (STE-43). Only push once hydration has resolved the session.
  useEffect(() => {
    if (hydrated && !isConnected) router.push("/");
  }, [hydrated, isConnected, router]);
  if (!hydrated) return null; // still deciding — no flash, no bounce
  if (!isConnected) return null; // redirecting
  return <>{children}</>;
}
```

- [ ] **Step 4: Run and verify GREEN**

Run: `pnpm --dir frontend exec vitest run components/__tests__/AuthGate.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/components/AuthGate.tsx frontend/components/__tests__/AuthGate.test.tsx
git commit -m "fix(STE-43): AuthGate holds redirect until wallet hydrates"
```

---

### Task 5: Landing auto-forwards a stored session

**Files:**
- Modify: `frontend/app/page.tsx`
- Test: `frontend/app/__tests__/page.test.tsx` (create)

**Interfaces:**
- Consumes: `useWallet()` → `{ address, hydrated, connect }` (from Task 3).
- Produces: renders `null` while `!hydrated` or while a session is present (forwarding via `router.replace("/home")`); otherwise the onboarding UI.

- [ ] **Step 1: Write the failing tests**

Create `frontend/app/__tests__/page.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import Landing from "../page";

const replace = vi.fn();
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, push }) }));
const useWallet = vi.fn();
vi.mock("../../hooks/useWallet", () => ({ useWallet: () => useWallet() }));

afterEach(() => vi.clearAllMocks());

test("shows onboarding when hydrated and disconnected", () => {
  useWallet.mockReturnValue({ address: null, hydrated: true, connect: vi.fn() });
  render(<Landing />);
  expect(screen.getByRole("button", { name: "Connect wallet" })).toBeInTheDocument();
  expect(replace).not.toHaveBeenCalled();
});

test("renders nothing and does not forward while hydrating", () => {
  useWallet.mockReturnValue({ address: undefined, hydrated: false, connect: vi.fn() });
  render(<Landing />);
  expect(screen.queryByRole("button", { name: "Connect wallet" })).not.toBeInTheDocument();
  expect(replace).not.toHaveBeenCalled();
});

test("forwards to /home when a session is hydrated", async () => {
  useWallet.mockReturnValue({ address: "GABC123", hydrated: true, connect: vi.fn() });
  render(<Landing />);
  await waitFor(() => expect(replace).toHaveBeenCalledWith("/home"));
  expect(screen.queryByRole("button", { name: "Connect wallet" })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run and verify RED**

Run: `pnpm --dir frontend exec vitest run app/__tests__/page.test.tsx`
Expected: FAIL — the current landing renders "Connect wallet" regardless of a hydrated session and never calls `replace`.

- [ ] **Step 3: Add the forward effect and hydration guard**

In `frontend/app/page.tsx`, change the `useWallet()` destructure and add the effect + guard. Edit the top of the `Landing` component (currently lines 73-85):

Replace:
```tsx
export default function Landing() {
  const router = useRouter();
  const { connect } = useWallet();
  const [inTour, setInTour] = useState(false);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Auto-dismiss the connect-error toast so it doesn't linger.
  useEffect(() => {
    if (!error) return;
    const id = setTimeout(() => setError(null), 4000);
    return () => clearTimeout(id);
  }, [error]);
```

with:
```tsx
export default function Landing() {
  const router = useRouter();
  const { connect, address, hydrated } = useWallet();
  const [inTour, setInTour] = useState(false);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // A returning user with a re-verified session skips onboarding entirely (STE-43). The wallet is
  // hydrated (and verified) in WalletProvider, so we only react to it here. `replace`, not `push`,
  // keeps the landing out of history so Back from /home doesn't return to onboarding.
  useEffect(() => {
    if (hydrated && address) router.replace("/home");
  }, [hydrated, address, router]);

  // Auto-dismiss the connect-error toast so it doesn't linger.
  useEffect(() => {
    if (!error) return;
    const id = setTimeout(() => setError(null), 4000);
    return () => clearTimeout(id);
  }, [error]);

  // Don't flash onboarding before hydration settles, or while forwarding a live session.
  if (!hydrated || address) return null;
```

- [ ] **Step 4: Run and verify GREEN**

Run: `pnpm --dir frontend exec vitest run app/__tests__/page.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Typecheck**

Run: `pnpm -C frontend typecheck`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add frontend/app/page.tsx frontend/app/__tests__/page.test.tsx
git commit -m "fix(STE-43): landing forwards a stored session to /home after hydration"
```

---

### Task 6: e2e proof goes green + journey helper tolerates auto-forward

Now the deep-link specs from Task 1 should pass. The one snag: `connectWallet()` does `goto("/")` then clicks "Connect wallet"; if a session already exists it auto-forwards and the button is gone. Make the helper tolerant, then confirm green.

**Files:**
- Modify: `frontend/e2e/support/journey.ts` (the `connectWallet` helper only; comment cleanup is Task 7)

**Interfaces:**
- Consumes: nothing new.
- Produces: `connectWallet(page)` still lands on `/home`, whether by clicking through onboarding or by auto-forward.

- [ ] **Step 1: Make `connectWallet` tolerant of an auto-forward**

Replace the `connectWallet` function in `frontend/e2e/support/journey.ts` with:

```ts
/** Land in the app with a stubbed wallet connected. The stub signs without a popup. */
export async function connectWallet(page: Page): Promise<void> {
  await page.goto("/");
  // With a session already stored, the landing auto-forwards to /home (STE-43) and the button is
  // gone — that path is itself proof the fix works. Only click when onboarding is actually shown.
  const connect = page.getByRole("button", { name: "Connect wallet" });
  if (await connect.isVisible().catch(() => false)) {
    await connect.click();
  }
  await expect(page).toHaveURL(/\/home$/);
}
```

- [ ] **Step 2: Run the deep-link specs GREEN**

Run: `pnpm --dir frontend exec playwright test authgate-deep-link --reporter=list`
Expected: PASS (2 tests). The stored session now survives `goto("/home")` and `goto("/")` forwards to `/home`.

- [ ] **Step 3: Run the whole e2e suite**

Run: `pnpm e2e`
Expected: all specs pass (the existing `demo-flow.spec.ts` three tests + the two new deep-link tests). `connectWallet`'s first call in each spec still starts from a fresh Playwright context (no session) so it clicks the button as before.

- [ ] **Step 4: Commit**

```bash
git add frontend/e2e/support/journey.ts
git commit -m "test(STE-43): connectWallet tolerates the landing auto-forward"
```

---

### Task 7: Simplify journey.ts and evaluate goBackTo()

The bug is fixed, so the STE-43 workaround comment is stale. Remove it. Then empirically test whether `page.goBack()` is now reliable enough to retire `goBackTo()`.

**Files:**
- Modify: `frontend/e2e/support/journey.ts`

**Interfaces:**
- Consumes/Produces: no signature change unless `goBackTo` is retired (decided by Step 2's result).

- [ ] **Step 1: Remove the stale STE-43 comment**

Delete the block comment at `frontend/e2e/support/journey.ts` lines 12-18 (the `/** Every gated route is reached by clicking … That is STE-43, a pre-existing bug this unit does not fix … */` comment). Leave `connectWallet`, `goBackTo`, `depositEurc`, and `shot` intact.

- [ ] **Step 2: Empirically test page.goBack() stability**

Run the suite three times in a row to see if the existing `goBackTo()` (app Back button) is still needed or if `page.goBack()` would be stable:

Run: `pnpm e2e && pnpm e2e && pnpm e2e`
Expected: 3× all green.

Decision rule:
- The pushState double-entry race that `goBackTo()` guards against is **not** STE-43 — it is an App Router history concern. Unless you can demonstrate `page.goBack()` passing all three runs in a spike, **keep `goBackTo()`** and stop here. Retiring it is a bonus, not a requirement (Axel's ACC: "bonus, bukan syarat").
- If you did spike `page.goBack()` and it was stable across all three runs, you may replace `goBackTo(page, url)` call sites with `await page.goBack(); await expect(page).toHaveURL(url);` and delete the helper. Otherwise leave it.

- [ ] **Step 3: Commit the comment cleanup (and helper change only if proven)**

```bash
git add frontend/e2e/support/journey.ts
git commit -m "test(STE-43): drop stale deep-link workaround note from journey helpers"
```

---

### Task 8: Full green gate + evidence

**Files:**
- Create: `docs/tests/linear-STE-43/e2e-evidence.md`
- Create: `docs/tests/linear-STE-43/screenshots/` (via `E2E_EVIDENCE=1`, optional but preferred)

- [ ] **Step 1: Run the full green gate**

Run each and capture output:
```bash
pnpm -r typecheck
pnpm -C frontend lint
pnpm -r test
pnpm e2e
```
Expected: typecheck clean; lint clean; all unit tests pass (frontend gains WalletProvider +3, AuthGate +1, landing +3 tests); e2e all green.

- [ ] **Step 2: Capture screenshots (preferred)**

The evidence helper `shot()` writes to `docs/tests/linear-STE-44/screenshots` today. For STE-43 the proof is behavioral (URLs), not visual, so screenshots are optional; if capturing, run:
```bash
E2E_EVIDENCE=1 pnpm e2e
```
Note in the evidence doc that `shot()`'s `EVIDENCE_DIR` still points at STE-44 (leave it — retargeting it is unrelated churn); the STE-43 proof is the passing spec output, not an image.

- [ ] **Step 3: Write the evidence doc**

Create `docs/tests/linear-STE-43/e2e-evidence.md` following the STE-27 shape: a Summary, the root cause in one paragraph, and a `Dev browser verification` block containing the `pnpm e2e` list output and the four green-gate command results. Include the exact `2 passed`/`5 passed` counts from Step 1.

- [ ] **Step 4: Commit**

```bash
git add docs/tests/linear-STE-43/
git commit -m "docs(STE-43): e2e evidence for the AuthGate hydration fix"
```

---

## Self-review notes

- **Spec coverage:** WalletProvider tri-state + reverify (Task 3), AuthGate hold (Task 4), landing forward (Task 5), e2e stub survives reload (Task 2), failing-first e2e (Task 1→6), journey cleanup (Task 7), green gate + evidence (Task 8). All spec sections mapped.
- **Type consistency:** context field names `hydrated`/`isConnected`/`address` used identically across Tasks 3-5; `soro.e2e.connected` key defined once in Task 2.
- **Danger #1** handled in Task 3 (getAddress reverify, clear on mismatch/throw). **Danger #2** handled in Task 2 (localStorage-backed stub) before Task 3 introduces the first getAddress caller — order matters, Task 2 precedes Task 3.
- **No consumer churn:** grep confirmed every `address` reader guards with `if (!address)`, which absorbs the new `undefined`; no edits needed outside the listed files.
