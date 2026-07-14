# STE-43 — AuthGate bounces deep links to landing despite a stored session

**Ticket:** STE-43 (frontend, parent STE-7). Pre-existing bug since U13, not a U17 regression.
**ACC:** Axel, 10 Jul 2026 — "unblocked, ini call kamu (frontend track) … murni frontend lifecycle, tak menyentuh backend/seam." Scope addition (auto-forward) recorded in ticket comment. No further approval needed.

## Problem

React runs effects child → parent. On a hard load:

- `components/AuthGate.tsx:9-11` — child effect sees `isConnected === false` and calls `router.push("/")`.
- `providers/WalletProvider.tsx:26-41` — the parent effect that restores `address` from `localStorage` runs **after** AuthGate has already decided.

On first paint `address` is always `null` (lazy `useState` from storage is not SSR-safe; hydration must go through an effect). So AuthGate always sees "disconnected" on the first load and bounces.

**Two symptoms, one root:**

1. **Deep link bounces.** Hard-load any gated route (`/home`, `/earn`, `/deposit/eurc`, `/account`) with `soro.wallet` still in localStorage → app throws the user to `/`. The page renders for a frame, then detaches.
2. **Sessioned user forced through onboarding.** `app/page.tsx` only calls `router.push("/home")` inside `onConnect` (~line 91). Nothing forwards a user who already has a stored session.

One hydration fix closes both.

## Danger #1 — the restored session is OPTIMISTIC

`WalletProvider.tsx:21-25` says it itself: a restored `address` reflects a previously-saved address, **not a verified live wallet session**. If the user revoked permission, locked Freighter, or switched accounts, "straight into the app" means entering with a **stale address** — and the failure only surfaces when they sign something.

**Decision (approved):** re-verification lives in the **WalletProvider hydration**, not only in the landing forward. Verifying once at the single hydration point covers both the auto-forward and every deep-load into a gated route, and it fully closes the optimistic-restore note (`isConnected` now means "verified live session" everywhere). Consequence, intended: a hard-load of `/home` with a locked/revoked wallet clears state and bounces to onboarding (fail-closed) — this is exactly what the WalletProvider comment predicted the future auth-gate should do.

## Danger #2 — getAddress() verification WILL break e2e, and it isn't your code's fault

`lib/wallet-e2e.ts:17` holds the connection flag in module scope:

```ts
let connected = false;
```

Module scope resets on every hard page load. Real Freighter does not — its connection lives in the extension, across reloads. So the moment we add getAddress() verification, every hard load in e2e fails verification, state is cleared, and the user is bounced — the tests that should *prove* the fix go red while the production code is correct.

**The fix is in the stub, not production.** `lib/wallet-e2e.ts` must mirror Freighter: the connection survives reloads. `connect()` writes a marker to `localStorage`; `disconnect()` removes it; `requireConnected()`/`getAddress()` read it. `lib/__tests__/wallet-e2e.test.ts` asserts `getAddress()` throws before `connect()` — that stays true (jsdom has `localStorage`; `beforeEach` already calls `disconnect()`).

Today no production code calls `getAddress()` (verified by grep) — we are the first caller.

## Design

### 1. WalletProvider — tri-state hydration + re-verification (the core)

`address` becomes the tri-state source of truth: `undefined` = not yet read, `null` = definitively disconnected, `string` = verified live session.

```ts
type Ctx = {
  address: string | null | undefined;   // undefined = not hydrated yet
  walletName: string | null;
  hydrated: boolean;      // derived: address !== undefined
  isConnected: boolean;   // derived: !!address (only a live string counts)
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  signTransaction: (xdr: string) => Promise<string>;
};
```

Initial `address = undefined`. The mount effect (client-only) becomes **async**:

- No `soro.wallet` stored → `setAddress(null)` (done, no getAddress call).
- Stored → `await getAddress()`:
  - returns exactly the saved address → `setAddress(saved)` (verified) and restore the persisted `walletName`.
  - throws, or returns a different address → clear `soro.wallet` + `soro.wallet.name`, `setAddress(null)`.

An `alive` guard prevents the async `setState` from leaking after unmount. The optimistic-restore comment (lines 21-25) is deleted — the debt is paid.

`connect`/`disconnect` are unchanged except that `disconnect` continues to clear both keys (already does).

### 2. AuthGate — hold the redirect until hydration

```ts
const { isConnected, hydrated } = useWallet();
useEffect(() => {
  if (hydrated && !isConnected) router.push("/");
}, [hydrated, isConnected, router]);
if (!hydrated) return null;      // still deciding — don't flash, don't bounce
if (!isConnected) return null;   // redirecting
return <>{children}</>;
```

No push on first paint. A deep-load with a stale wallet resolves to `hydrated && !isConnected` and bounces cleanly.

### 3. `/` (landing) — auto-forward after hydration

```ts
const { address, hydrated } = useWallet();
useEffect(() => {
  if (hydrated && address) router.replace("/home");
}, [hydrated, address, router]);
if (!hydrated || address) return null;   // deciding / forwarding
```

`router.replace`, not `push`, so the landing is not stacked in history. Verification already happened in the provider, so the landing only reacts to state. `onConnect` keeps `push("/home")`.

### 4. lib/wallet-e2e.ts — stub survives reloads (Danger #2)

Replace the module-scope `let connected` with a `localStorage`-backed marker (`soro.e2e.connected`) so it mirrors Freighter across reloads. `connect()` sets it, `disconnect()` removes it, `requireConnected()` checks it, guarded by `typeof window !== "undefined"` (client-only, same as the real wallet). The unit test stays green as written.

## Tests (write the failing ones first)

- **New e2e** `frontend/e2e/authgate-deep-link.spec.ts`:
  1. connect → `page.goto("/home")` → assert URL stays `/home`.
  2. stored session → `page.goto("/")` → lands on `/home` without clicking "Connect wallet".
  Run these **red first** (before touching production code), then green.
- **Unit:**
  - `AuthGate.test.tsx` — `hydrated=false` → renders null, does NOT push; `hydrated && connected` → children; `hydrated && !connected` → push `/`.
  - `WalletProvider.test.tsx` — tri-state hydration; re-verify via mocked `getAddress`; clear localStorage + `null` on mismatch/throw; still restores + verifies on match.
  - Landing — forwards to `/home` when `hydrated && address`; renders onboarding when hydrated & disconnected.
- **journey.ts cleanup:** remove the STE-43 comment (lines 12-18); make `connectWallet()` tolerant of an auto-forward (skip the button if already on `/home`). `goBackTo()` is evaluated empirically — dropped only if `page.goBack()` passes several consecutive `pnpm e2e` runs; otherwise kept (the pushState double-entry race is a separate concern, not STE-43).

## Invariants held

- Safety invisible — no risk/tier/score field or label added.
- Per-currency buckets untouched; no fund conversion.
- KEEPER_SECRET backend-only; no secret reaches the client.
- All wallet code stays client-only (`"use client"` + effect), never module scope — no `window is not defined` / hydration mismatch.

## Green gate

`pnpm -r typecheck` (hard gate, `noUncheckedIndexedAccess` — the `string | null | undefined` tri-state is checked strictly) + `pnpm -C frontend lint` + `pnpm -r test` + `pnpm e2e`. Evidence → `docs/tests/linear-STE-43/` (pr-e2e-evidence template). Linear team has no "In Review" status — In Progress until merge.

## Out of scope (new ticket + @axelmatsama first)

Changing how `soro.wallet` is persisted, adding a refresh-token, or touching `lib/wallet-real.ts`.
