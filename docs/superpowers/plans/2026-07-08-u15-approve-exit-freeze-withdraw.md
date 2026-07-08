# U15 — Approve-exit + freeze status + withdraw signing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build SoroSense's single approval surface — a Sentinel-freeze safe-exit approval sheet, a prominent freeze banner, and withdraw signing — while auto-compound/auto-rebalance stay silent.

**Architecture:** A `usePendingExit()` hook is the single source of truth for both the freeze banner's visibility and the `ExitApproval` bottom-sheet's content; it reads the vault seam (`activePool`/`poolStatus`/`pendingExit`/`assetValueOf`). Approve signs `approveExit` via the wallet (same `depositorSigner` pattern as U14 withdraw) and bumps the vault provider's `version` so the banner clears live. The dev seed gains a keeper `proposeExit` so `pendingExit("EUR")` returns a proposal.

**Tech Stack:** Next 16 · React 19 · Tailwind v4 · TypeScript (strict, `noUncheckedIndexedAccess`) · Vitest + @testing-library/react (v16, `renderHook` available) + @testing-library/user-event · `@sorosense/vault-client` `MockVaultClient`.

## Global Constraints

- **No risk label / tier / score on any user surface** — no `risk`/`label`/`score`/`tier` field on any object; copy never says "Sentinel" or "risk" (invisible-safety, consistent with U14).
- **DRY primitives** — reuse `BottomSheet`, `Button` (`variant="ink"`/`"glass"`), `Toast`, `CoinBadge`, `depositorSigner`, `formatCurrency`; never re-style a primitive per screen.
- **Wallet signing is client-only** — components are `"use client"`; wallet access only via `useWallet()`. Keeper ops (`proposeExit`/`freeze`) are dev-seed only, never in a client approval path.
- **Per-currency buckets, never converted** — the exit moves EUR → EUR.
- **Do not modify** `packages/vault-client`, `WithdrawKeypad`, or `DepositKeypad`.
- **Typecheck is a hard gate** — `pnpm -C frontend typecheck` (indexed access is `T | undefined`; guard with `?? null`).
- **Commit trailer** — every commit message ends with:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

## File Structure

| File | Responsibility |
|---|---|
| `frontend/lib/vault/data.ts` (modify) | add `getPoolMeta(poolId)` — display name + APY for a target pool |
| `frontend/lib/vault/seed.ts` (modify) | add `SEED_SAFE_EXIT` + keeper `proposeExit("EUR", …)` |
| `frontend/hooks/usePendingExit.ts` (create) | single source: frozen bucket + its exit proposal, display-ready |
| `frontend/providers/VaultProvider.tsx` (modify) | add `bump()` to the context so consumers re-read after a mutation |
| `frontend/components/status/FreezeBanner.tsx` (move) | relocated from `components/home/` (markup unchanged) |
| `frontend/components/proposal/ExitApproval.tsx` (create) | approve-exit bottom sheet + state machine |
| `frontend/app/(app)/home/page.tsx` (modify) | banner visibility via `usePendingExit`; banner opens the sheet |
| `frontend/app/(flow)/account/activity/page.tsx` (modify) | "Review" opens the same sheet |

---

## Task 1: Data + seed foundation (`getPoolMeta`, `SEED_SAFE_EXIT`, `proposeExit`)

**Files:**
- Modify: `frontend/lib/vault/data.ts`
- Modify: `frontend/lib/vault/seed.ts`
- Test: `frontend/lib/vault/__tests__/data.test.ts`, `frontend/lib/vault/__tests__/seed.test.ts`

**Interfaces:**
- Produces: `getPoolMeta(poolId: string): { name: string; apy: number } | null`
- Produces: `SEED_SAFE_EXIT: Record<Currency, string>` (from `seed.ts`), with `EUR: "pool-defindex-eur"`
- Consumes: existing `MockVaultClient` seam (`proposeExit`, `pendingExit`).

- [ ] **Step 1: Write the failing test for `getPoolMeta`**

Append to `frontend/lib/vault/__tests__/data.test.ts`:

```ts
import { getPoolMeta } from "../data";

test("getPoolMeta returns display name + apy for a target pool, null otherwise, no risk field", () => {
  const eur = getPoolMeta("pool-defindex-eur");
  expect(eur).toEqual({ name: "DeFindex EURC", apy: 5.9 });
  expect(getPoolMeta("pool-unknown")).toBeNull();
  expect(JSON.stringify(eur)).not.toMatch(/risk|tier|score/i);
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm -C frontend test -- data.test`
Expected: FAIL — `getPoolMeta is not a function`.

- [ ] **Step 3: Implement `getPoolMeta`**

In `frontend/lib/vault/data.ts`, add below `getBucketMeta`:

```ts
/** Display data for a safe-exit *target* pool, keyed by pool id. No risk field (invisible safety). */
const POOL_META: Record<string, { name: string; apy: number }> = {
  "pool-defindex-eur": { name: "DeFindex EURC", apy: 5.9 },
};

/** Name + APY to render an exit proposal's target pool; null for pools with no display entry. */
export function getPoolMeta(poolId: string): { name: string; apy: number } | null {
  return POOL_META[poolId] ?? null;
}
```

- [ ] **Step 4: Write the failing test for the seeded proposal**

Append to `frontend/lib/vault/__tests__/seed.test.ts`:

```ts
import { SEED_SAFE_EXIT } from "../seed";

test("seed proposes a safe exit for the frozen EUR pool (drives banner + sheet)", async () => {
  const c = new MockVaultClient();
  await seedVault(c, "GUSER");
  const exit = await c.pendingExit("EUR");
  expect(exit).not.toBeNull();
  expect(exit?.fromPool).toBe(SEED_POOLS.EUR);
  expect(exit?.toPool).toBe(SEED_SAFE_EXIT.EUR);
  expect(await c.pendingExit("USD")).toBeNull(); // active pool → no exit
});
```

- [ ] **Step 5: Run it to confirm it fails**

Run: `pnpm -C frontend test -- seed.test`
Expected: FAIL — `pendingExit("EUR")` is `null` / `SEED_SAFE_EXIT` undefined.

- [ ] **Step 6: Implement the seed change**

In `frontend/lib/vault/seed.ts`, add the constant next to `SEED_POOLS`:

```ts
/** Safe target pool per currency for a Sentinel-freeze exit (dev seed). Only EUR is exercised. */
export const SEED_SAFE_EXIT: Record<Currency, string> = {
  USD: "pool-defindex-usd",
  EUR: "pool-defindex-eur",
  MXN: "pool-etherfuse-mxn",
};
```

Then, inside `seedVault`, add the keeper `proposeExit` immediately after the existing `freeze` line:

```ts
  await client.freeze(SEED_POOLS.EUR).signAndSubmit(keep);
  // Propose the safe exit the depositor will approve in U15 (keeper-signed, dev-only).
  await client.proposeExit("EUR", SEED_POOLS.EUR, SEED_SAFE_EXIT.EUR).signAndSubmit(keep);
```

- [ ] **Step 7: Run both test files to confirm they pass**

Run: `pnpm -C frontend test -- data.test seed.test`
Expected: PASS (all tests in both files).

- [ ] **Step 8: Typecheck + commit**

Run: `pnpm -C frontend typecheck`  (Expected: no errors)

```bash
git add frontend/lib/vault/data.ts frontend/lib/vault/seed.ts frontend/lib/vault/__tests__/data.test.ts frontend/lib/vault/__tests__/seed.test.ts
git commit -m "feat(U15): seed safe-exit proposal + getPoolMeta target-pool display (STE-25)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: `usePendingExit` hook

**Files:**
- Create: `frontend/hooks/usePendingExit.ts`
- Test: `frontend/hooks/__tests__/usePendingExit.test.tsx`

**Interfaces:**
- Consumes: `useWallet()` → `{ address }`; `useVault()` → `{ client, version }`; `getPoolMeta` + `STABLECOINS` from `lib/vault/data`.
- Produces:
  ```ts
  interface PendingExitView {
    currency: Currency;
    proposal: ExitProposal | null;   // null → frozen but not-yet-proposed (interstitial)
    fromLabel: string;               // "Paused EURC pool"
    amount: bigint;                  // live bucket value (base units)
    toMeta: { name: string; apy: number } | null;
  }
  function usePendingExit(): PendingExitView | null   // null → no frozen bucket → banner hidden
  ```

- [ ] **Step 1: Write the failing test**

Create `frontend/hooks/__tests__/usePendingExit.test.tsx`:

```tsx
import type { ReactNode } from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { MockVaultClient } from "@sorosense/vault-client";
import { VaultProvider } from "../../providers/VaultProvider";
import { seedVault } from "../../lib/vault/seed";
import { usePendingExit } from "../usePendingExit";

const useWallet = vi.fn();
vi.mock("../useWallet", () => ({ useWallet: () => useWallet() }));

test("surfaces the frozen EUR bucket with its safe-exit proposal", async () => {
  useWallet.mockReturnValue({ address: "GUSER", isConnected: true });
  const client = new MockVaultClient();
  await seedVault(client, "GUSER");
  const wrapper = ({ children }: { children: ReactNode }) => (
    <VaultProvider client={client}>{children}</VaultProvider>
  );
  const { result } = renderHook(() => usePendingExit(), { wrapper });

  await waitFor(() => expect(result.current?.currency).toBe("EUR"));
  expect(result.current?.proposal).not.toBeNull();
  expect(result.current?.fromLabel).toBe("Paused EURC pool");
  expect(result.current?.toMeta?.name).toBe("DeFindex EURC");
  expect(result.current?.amount).toBeGreaterThan(0n);
});

test("returns null when there is no frozen bucket", async () => {
  useWallet.mockReturnValue({ address: "GUSER", isConnected: true });
  const client = new MockVaultClient(); // unseeded → nothing frozen
  const wrapper = ({ children }: { children: ReactNode }) => (
    <VaultProvider client={client}>{children}</VaultProvider>
  );
  const { result } = renderHook(() => usePendingExit(), { wrapper });
  await waitFor(() => expect(result.current).toBeNull());
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm -C frontend test -- usePendingExit`
Expected: FAIL — cannot find module `../usePendingExit`.

- [ ] **Step 3: Implement the hook**

Create `frontend/hooks/usePendingExit.ts`:

```ts
"use client";
import { useEffect, useState } from "react";
import type { Currency, ExitProposal } from "@sorosense/vault-client";
import { useWallet } from "./useWallet";
import { useVault } from "./useVault";
import { STABLECOINS, getPoolMeta } from "../lib/vault/data";

const CURRENCIES: readonly Currency[] = ["USD", "EUR", "MXN"];

export interface PendingExitView {
  currency: Currency;
  proposal: ExitProposal | null;
  fromLabel: string;
  amount: bigint;
  toMeta: { name: string; apy: number } | null;
}

/**
 * The single source of truth for the freeze banner's visibility and the ExitApproval sheet's
 * content. Finds the first currency whose active pool is frozen, then reads its pending exit
 * proposal and live bucket value. Returns null when nothing is frozen (banner hidden). A frozen
 * bucket with no proposal yet returns a view with `proposal: null` (the interstitial state).
 */
export function usePendingExit(): PendingExitView | null {
  const { address } = useWallet();
  const { client, version } = useVault();
  const [view, setView] = useState<PendingExitView | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!address) {
        if (!cancelled) setView(null);
        return;
      }
      for (const currency of CURRENCIES) {
        const pool = await client.activePool(currency);
        if (!pool || (await client.poolStatus(pool)) !== "frozen") continue;
        const proposal = await client.pendingExit(currency);
        const amount = await client.assetValueOf(address, currency);
        const sym = STABLECOINS.find((s) => s.currency === currency)?.sym ?? currency;
        const toMeta = proposal ? getPoolMeta(proposal.toPool) : null;
        if (!cancelled) setView({ currency, proposal, fromLabel: `Paused ${sym} pool`, amount, toMeta });
        return;
      }
      if (!cancelled) setView(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [address, client, version]);

  return view;
}
```

- [ ] **Step 4: Run it to confirm it passes**

Run: `pnpm -C frontend test -- usePendingExit`
Expected: PASS (both tests).

- [ ] **Step 5: Typecheck + commit**

Run: `pnpm -C frontend typecheck`  (Expected: no errors)

```bash
git add frontend/hooks/usePendingExit.ts frontend/hooks/__tests__/usePendingExit.test.tsx
git commit -m "feat(U15): usePendingExit — single source for freeze banner + exit sheet (STE-25)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: `VaultProvider.bump()` for live re-reads

**Files:**
- Modify: `frontend/providers/VaultProvider.tsx`
- Test: `frontend/providers/__tests__/VaultProvider.test.tsx` (existing file — append)

**Interfaces:**
- Produces: context `Ctx = { client: MockVaultClient; version: number; bump: () => void }`.
- Consumed by: Task 5 (`ExitApproval` calls `bump()` after a successful approve).

- [ ] **Step 1: Write the failing test**

Append to `frontend/providers/__tests__/VaultProvider.test.tsx`:

```tsx
import type { ReactNode } from "react";
import { renderHook, act } from "@testing-library/react";
import { MockVaultClient } from "@sorosense/vault-client";
import { VaultProvider } from "../VaultProvider";
import { useVault } from "../../hooks/useVault";

test("bump() increments version so consumers re-read", () => {
  // No address → the seed effect early-returns and never bumps, so version is deterministic.
  const client = new MockVaultClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <VaultProvider client={client}>{children}</VaultProvider>
  );
  const { result } = renderHook(() => useVault(), { wrapper });
  const before = result.current.version;
  act(() => result.current.bump());
  expect(result.current.version).toBe(before + 1);
});
```

> Note: `VaultProvider` calls `useWallet()` internally. Check the top of the existing test file — if `useWallet` is not already mocked there, add `const useWallet = vi.fn().mockReturnValue({ address: undefined }); vi.mock("../../hooks/useWallet", () => ({ useWallet: () => useWallet() }));` alongside the existing mocks so `address` is `undefined` (no seed, no stray bump).

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm -C frontend test -- VaultProvider`
Expected: FAIL — `result.current.bump is not a function`.

- [ ] **Step 3: Implement `bump`**

In `frontend/providers/VaultProvider.tsx`:

1. Add `useCallback` to the React import:
```ts
import { createContext, useCallback, useEffect, useState, type ReactNode } from "react";
```
2. Extend the context type:
```ts
type Ctx = { client: MockVaultClient; version: number; bump: () => void };
```
3. Inside `VaultProvider`, after the `useState`/`useEffect`, add:
```ts
  const bump = useCallback(() => setVersion((n) => n + 1), []);
```
4. Pass it through the provider value:
```ts
  return <VaultContext.Provider value={{ client: resolvedClient, version, bump }}>{children}</VaultContext.Provider>;
```

- [ ] **Step 4: Run it to confirm it passes**

Run: `pnpm -C frontend test -- VaultProvider`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

Run: `pnpm -C frontend typecheck`  (Expected: no errors — `bump` is additive; existing `{ client, version }` consumers are unaffected)

```bash
git add frontend/providers/VaultProvider.tsx frontend/providers/__tests__/VaultProvider.test.tsx
git commit -m "feat(U15): VaultProvider.bump() for live re-read after a mutation (STE-25)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Relocate FreezeBanner to `components/status/`

**Files:**
- Move: `frontend/components/home/FreezeBanner.tsx` → `frontend/components/status/FreezeBanner.tsx`
- Modify: `frontend/app/(app)/home/page.tsx` (import path only)

**Interfaces:**
- Produces: `FreezeBanner` at its ticket-canonical path; component signature unchanged (`{ onReview: () => void }`).

- [ ] **Step 1: Move the file with git (preserves history)**

```bash
mkdir -p frontend/components/status
git mv frontend/components/home/FreezeBanner.tsx frontend/components/status/FreezeBanner.tsx
```

- [ ] **Step 2: Update the import in `home/page.tsx`**

In `frontend/app/(app)/home/page.tsx`, change:
```ts
import { FreezeBanner } from "../../../components/home/FreezeBanner";
```
to:
```ts
import { FreezeBanner } from "../../../components/status/FreezeBanner";
```

- [ ] **Step 3: Confirm nothing else imports the old path**

Run: `git grep -n "components/home/FreezeBanner"`
Expected: no matches.

- [ ] **Step 4: Typecheck + run the home test (verifies the move)**

Run: `pnpm -C frontend typecheck`  (Expected: no errors)
Run: `pnpm -C frontend test -- home.test`
Expected: PASS — including the existing `"Your earning is paused"` assertion.

- [ ] **Step 5: Commit**

```bash
git add -A frontend/components frontend/app/(app)/home/page.tsx
git commit -m "refactor(U15): move FreezeBanner to components/status per STE-25

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: `ExitApproval` sheet + state machine

**Files:**
- Create: `frontend/components/proposal/ExitApproval.tsx`
- Test: `frontend/components/proposal/__tests__/ExitApproval.test.tsx`

**Interfaces:**
- Consumes: `usePendingExit()` (Task 2); `useWallet()` → `{ address, signTransaction }`; `useVault()` → `{ client, bump }` (Task 3); `depositorSigner` (`lib/vault/signer`); `formatCurrency` (`lib/vault/units`); `Button`, `Toast`, `BottomSheet` (`../ui`); `toWalletError`, `USER_CLOSED_MODAL` (`lib/wallet-error`).
- Produces: `function ExitApproval({ open, onClose }: { open: boolean; onClose: () => void }): JSX.Element`

- [ ] **Step 1: Write the failing tests**

Create `frontend/components/proposal/__tests__/ExitApproval.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockVaultClient } from "@sorosense/vault-client";
import { VaultProvider } from "../../../providers/VaultProvider";
import { seedVault, SEED_SAFE_EXIT } from "../../../lib/vault/seed";
import { ExitApproval } from "../ExitApproval";

const useWallet = vi.fn();
vi.mock("../../../hooks/useWallet", () => ({ useWallet: () => useWallet() }));

function setup() {
  const sign = vi.fn(async (x: string) => x);
  useWallet.mockReturnValue({ address: "GUSER", isConnected: true, signTransaction: sign });
  const client = new MockVaultClient();
  const onClose = vi.fn();
  return { client, onClose, sign };
}

test("shows the safe-exit move + approve/decline actions", async () => {
  const { client, onClose } = setup();
  await seedVault(client, "GUSER");
  render(<VaultProvider client={client}><ExitApproval open onClose={onClose} /></VaultProvider>);

  await waitFor(() => expect(screen.getByText("Paused EURC pool")).toBeInTheDocument());
  expect(screen.getByText("DeFindex EURC")).toBeInTheDocument();
  expect(screen.getByText(/5\.90% APY/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Approve and sign in wallet" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Keep it paused" })).toBeInTheDocument();
});

test("approve signs approveExit and moves the bucket to the safe pool", async () => {
  const { client, onClose } = setup();
  await seedVault(client, "GUSER");
  const user = userEvent.setup();
  render(<VaultProvider client={client}><ExitApproval open onClose={onClose} /></VaultProvider>);

  await waitFor(() => expect(screen.getByText("DeFindex EURC")).toBeInTheDocument());
  await user.click(screen.getByRole("button", { name: "Approve and sign in wallet" }));

  await waitFor(async () => expect(await client.pendingExit("EUR")).toBeNull());
  expect(await client.activePool("EUR")).toBe(SEED_SAFE_EXIT.EUR);
  expect(onClose).toHaveBeenCalled();
});

test("decline closes without calling the seam — funds stay put", async () => {
  const { client, onClose } = setup();
  await seedVault(client, "GUSER");
  const user = userEvent.setup();
  render(<VaultProvider client={client}><ExitApproval open onClose={onClose} /></VaultProvider>);

  await waitFor(() => expect(screen.getByText("DeFindex EURC")).toBeInTheDocument());
  await user.click(screen.getByRole("button", { name: "Keep it paused" }));

  expect(onClose).toHaveBeenCalled();
  expect(await client.pendingExit("EUR")).not.toBeNull(); // proposal intact, nothing moved
  expect(await client.activePool("EUR")).toBe("pool-blend-eur"); // still the frozen pool
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm -C frontend test -- ExitApproval`
Expected: FAIL — cannot find module `../ExitApproval`.

- [ ] **Step 3: Implement the component**

Create `frontend/components/proposal/ExitApproval.tsx`:

```tsx
"use client";
import { useRef, useState } from "react";
import { Button, BottomSheet, Toast } from "../ui";
import { usePendingExit } from "../../hooks/usePendingExit";
import { useVault } from "../../hooks/useVault";
import { useWallet } from "../../hooks/useWallet";
import { depositorSigner } from "../../lib/vault/signer";
import { formatCurrency } from "../../lib/vault/units";
import { toWalletError, USER_CLOSED_MODAL } from "../../lib/wallet-error";

/**
 * The only approval surface for a Sentinel-freeze exit. Reads the frozen bucket + its proposal via
 * usePendingExit and drives the state machine:
 *   frozen-not-yet-proposed → interstitial · proposed → approve/decline · signing → busy ·
 *   confirmed → bump + toast + close · failed → toast (user-closed-modal is silent).
 * Decline moves nothing (funds are never moved without approval). Copy is invisible-safety: no
 * "Sentinel"/"risk" wording. Withdraw signing reuses the same depositorSigner + signAndSubmit path.
 */
export function ExitApproval({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pend = usePendingExit();
  const { client, bump } = useVault();
  const { address, signTransaction } = useWallet();
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  const onApprove = async () => {
    if (inFlight.current || !address || !pend?.proposal || busy) return;
    inFlight.current = true;
    setBusy(true);
    try {
      await client
        .approveExit(address, pend.proposal.id)
        .signAndSubmit(depositorSigner(address, signTransaction));
      bump(); // re-read: banner clears, bucket un-freezes
      setToast("Exit approved. Moving to a safe pool.");
      onClose();
    } catch (e) {
      const w = toWalletError(e);
      if (w.code !== USER_CLOSED_MODAL) setToast(w.message); // user closed modal → silent
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  };

  const onDecline = () => {
    setToast("Kept paused — your funds stay safe."); // no seam call: funds never move without approval
    onClose();
  };

  return (
    <>
    <BottomSheet open={open} onClose={onClose} label="Approve safe exit">
      <h1 className="mb-1.5 text-xl font-semibold">Approve safe exit</h1>
      {pend?.proposal ? (
        <>
          <p className="mb-[18px] text-sm text-muted">
            We paused your {pend.currency === "EUR" ? "EURC" : pend.currency} pool to keep it safe. Your
            funds are protected — approve moving them to a safe pool in the same currency.
          </p>
          <div className="rounded-[18px] border border-line bg-white p-3.5">
            <div className="flex items-center gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-warn-soft text-warn">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M9 5v14M15 5v14" /></svg>
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[11.5px] text-muted">From</div>
                <div className="font-semibold">{pend.fromLabel}</div>
              </div>
              <div className="font-semibold">{formatCurrency(pend.amount, pend.currency)}</div>
            </div>
            <div className="my-1 grid place-items-center text-faint">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M6 13l6 6 6-6" /></svg>
            </div>
            <div className="flex items-center gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#e8f5ee] text-pos">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[11.5px] text-muted">To</div>
                <div className="font-semibold">{pend.toMeta?.name ?? "Safe pool"}</div>
              </div>
              {pend.toMeta && <div className="font-semibold text-pos">{pend.toMeta.apy.toFixed(2)}% APY</div>}
            </div>
          </div>
          <Button className="mt-[18px]" onClick={onApprove} disabled={busy}>Approve and sign in wallet</Button>
          <Button variant="glass" className="mt-2.5" onClick={onDecline} disabled={busy}>Keep it paused</Button>
          <p className="mt-3 text-center text-xs text-muted">Your funds stay safe either way. Nothing moves until you approve.</p>
        </>
      ) : (
        <p className="mb-2 text-sm text-muted">Preparing a safe exit… Your funds are protected in the meantime.</p>
      )}
    </BottomSheet>
    {/* Toast lives outside the sheet so it stays visible after approve closes the sheet. */}
    <Toast open={!!toast} message={toast ?? ""} />
    </>
  );
}
```

> **Token note:** verified against `frontend/app/globals.css` `@theme` — `--color-warn`/`--color-warn-soft`/`--color-pos`/`--color-line`/`--color-muted`/`--color-faint` all exist, so `text-warn`/`bg-warn-soft`/`text-pos`/`border-line`/`text-muted`/`text-faint` are valid. There is **no** `pos-soft` token, so the "To" icon uses the arbitrary value `bg-[#e8f5ee]` (matching the mockup's soft green; same arbitrary-hex pattern U14 uses for `bg-[#ECECEC]`). Do **not** add a new theme token.

- [ ] **Step 4: Run it to confirm it passes**

Run: `pnpm -C frontend test -- ExitApproval`
Expected: PASS (all three tests).

- [ ] **Step 5: Typecheck + commit**

Run: `pnpm -C frontend typecheck`  (Expected: no errors)

```bash
git add frontend/components/proposal/ExitApproval.tsx frontend/components/proposal/__tests__/ExitApproval.test.tsx
git commit -m "feat(U15): ExitApproval sheet — approve safe exit + sign via wallet (STE-25)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Wire home + activity to the sheet (+ AE1 no-prompt check)

**Files:**
- Modify: `frontend/app/(app)/home/page.tsx`
- Modify: `frontend/app/(flow)/account/activity/page.tsx`
- Test: `frontend/app/(app)/home/__tests__/home.test.tsx` (append)
- Test: `frontend/app/(flow)/account/activity/__tests__/activity.test.tsx` (modify existing render + append)

**Interfaces:**
- Consumes: `usePendingExit` (Task 2), `ExitApproval` (Task 5).

- [ ] **Step 1: Wire the home page**

In `frontend/app/(app)/home/page.tsx`:

1. Add imports:
```ts
import { useState } from "react";
import { ExitApproval } from "../../../components/proposal/ExitApproval";
import { usePendingExit } from "../../../hooks/usePendingExit";
```
2. In the component body, replace `const anyFrozen = buckets.some((b) => b.frozen);` with:
```ts
  const pend = usePendingExit();
  const [exitOpen, setExitOpen] = useState(false);
```
3. Replace the banner line:
```tsx
      {anyFrozen && <FreezeBanner onReview={() => nav.forward("/account/activity")} />}
```
with:
```tsx
      {pend && <FreezeBanner onReview={() => setExitOpen(true)} />}
```
4. Before the closing `</div>` of the returned tree, mount the sheet:
```tsx
      <ExitApproval open={exitOpen} onClose={() => setExitOpen(false)} />
```

- [ ] **Step 2: Wire the activity page**

In `frontend/app/(flow)/account/activity/page.tsx`:

1. Add imports:
```ts
import { ExitApproval } from "../../../../components/proposal/ExitApproval";
```
2. Add sheet state next to the existing `useState`:
```ts
  const [exitOpen, setExitOpen] = useState(false);
```
3. Change the `ActivityList` `onReview` from `() => router.push("/account/activity")` to `() => setExitOpen(true)`.
4. Mount the sheet before the closing `</div>`:
```tsx
      <ExitApproval open={exitOpen} onClose={() => setExitOpen(false)} />
```

- [ ] **Step 3: Update the existing activity test to provide the vault context**

`ExitApproval` needs `VaultProvider`, so the existing `render(<ActivityPage />)` will now throw. In `frontend/app/(flow)/account/activity/__tests__/activity.test.tsx`:

Replace the whole top-of-file mock block + render with:
```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockVaultClient } from "@sorosense/vault-client";
import { VaultProvider } from "../../../../../providers/VaultProvider";
import { seedVault } from "../../../../../lib/vault/seed";
import ActivityPage from "../page";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), back: vi.fn() }) }));
const useWallet = vi.fn();
vi.mock("../../../../../hooks/useWallet", () => ({ useWallet: () => useWallet() }));

function renderActivity() {
  useWallet.mockReturnValue({ address: "GUSER", isConnected: true, signTransaction: vi.fn(async (x: string) => x) });
  const client = new MockVaultClient();
  return seedVault(client, "GUSER").then(() =>
    render(<VaultProvider client={client}><ActivityPage /></VaultProvider>)
  );
}

test("activity page filters to Yours", async () => {
  const user = userEvent.setup();
  await renderActivity();
  expect(screen.getByText(/Switched to DeFindex/)).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Yours" }));
  expect(screen.queryByText(/Switched to DeFindex/)).not.toBeInTheDocument();
  expect(screen.getByText(/Moved \$500 to your wallet/)).toBeInTheDocument();
});
```

Then append the AE1 + wiring tests:
```tsx
test("AE1 — only the proposed-exit row has a Review action (auto-compound/rebalance never prompt)", async () => {
  await renderActivity();
  // Exactly one Review button: the safe-exit proposal. Rebalance/compound rows carry none.
  expect(screen.getAllByRole("button", { name: "Review" })).toHaveLength(1);
});

test("tapping Review opens the exit approval sheet", async () => {
  const user = userEvent.setup();
  await renderActivity();
  // `hidden: true` includes the aria-hidden (closed) sheet — getByRole excludes it otherwise.
  const dialog = screen.getByRole("dialog", { name: "Approve safe exit", hidden: true });
  expect(dialog).toHaveAttribute("aria-hidden", "true");
  await user.click(screen.getByRole("button", { name: "Review" }));
  await waitFor(() => expect(dialog).toHaveAttribute("aria-hidden", "false"));
});
```

- [ ] **Step 4: Append the home wiring test**

In `frontend/app/(app)/home/__tests__/home.test.tsx`, append:
```tsx
test("tapping the freeze banner opens the exit approval sheet", async () => {
  useWallet.mockReturnValue({ address: "GUSER", isConnected: true, signTransaction: vi.fn(async (x: string) => x) });
  const client = new MockVaultClient();
  await seedVault(client, "GUSER");
  const user = userEvent.setup();
  render(<VaultProvider client={client}><HomePage /></VaultProvider>);

  await waitFor(() => expect(screen.getByText("Your earning is paused")).toBeInTheDocument());
  // `hidden: true` includes the aria-hidden (closed) sheet — getByRole excludes it otherwise.
  const dialog = screen.getByRole("dialog", { name: "Approve safe exit", hidden: true });
  expect(dialog).toHaveAttribute("aria-hidden", "true");
  await user.click(screen.getByRole("button", { name: "Review paused pool" }));
  await waitFor(() => expect(dialog).toHaveAttribute("aria-hidden", "false"));
});
```

Add `userEvent` to the home test imports if not present:
```ts
import userEvent from "@testing-library/user-event";
```

- [ ] **Step 5: Run the affected tests**

Run: `pnpm -C frontend test -- home.test activity.test`
Expected: PASS (existing + new tests in both files).

- [ ] **Step 6: Full frontend suite + typecheck**

Run: `pnpm -C frontend typecheck`  (Expected: no errors)
Run: `pnpm -C frontend test`
Expected: PASS — all suites green (no regressions in deposit/withdraw/earn/etc.).

- [ ] **Step 7: Commit**

```bash
git add frontend/app/(app)/home/page.tsx frontend/app/(flow)/account/activity/page.tsx frontend/app/(app)/home/__tests__/home.test.tsx frontend/app/(flow)/account/activity/__tests__/activity.test.tsx
git commit -m "feat(U15): wire freeze banner + activity Review to the exit sheet (STE-25)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Final verification (after all tasks)

- [ ] `pnpm -C frontend typecheck` — green.
- [ ] `pnpm -C frontend test` — green.
- [ ] `pnpm -r typecheck && pnpm -r test` — whole workspace still green (nothing outside `frontend/` changed).
- [ ] Dev-browser e2e evidence for the PR (`pr-e2e-evidence` template, before/after composite):
  1. Home shows the freeze banner ("Your earning is paused").
  2. Tap banner → exit sheet: From "Paused EURC pool" → To "DeFindex EURC · 5.90% APY".
  3. Approve → wallet signs → toast "Exit approved. Moving to a safe pool." → banner clears + EUR bucket no longer paused.
  4. Re-open (reset) → Decline ("Keep it paused") → toast "Kept paused — your funds stay safe."; funds unchanged.
  5. Activity tab: `rebalanced`/`compounded` rows show **no** Review button (AE1); only the proposed-exit row does.
  6. Withdraw still signs (U14 regression check).

## Spec coverage map

| Spec item | Task |
|---|---|
| `git mv` FreezeBanner → `status/` | Task 4 |
| ExitApproval sheet + state machine | Task 5 |
| Seed `proposeExit` + `SEED_SAFE_EXIT` | Task 1 |
| `getPoolMeta` target-pool display | Task 1 |
| `usePendingExit` single source | Task 2 |
| `VaultProvider.bump()` live refresh | Task 3 |
| Banner + Review both open the sheet | Task 6 |
| Invisible-safety copy (no Sentinel/risk) | Task 5 (sheet), Task 4 (banner unchanged) |
| Decline reworded "Keep it paused" | Task 5 |
| Withdraw reuses depositorSigner (no change) | (verified, not modified) — Task 6 final suite |
| AE2 protected-not-moved | Task 5 (decline test), usePendingExit reads unchanged value |
| AE1 no prompt for auto-compound/rebalance | Task 6 |
```
