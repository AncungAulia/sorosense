# U15 — Approve-exit + freeze status + withdraw signing (design)

**Linear:** STE-25 (parent STE-7) · **Depends:** U14 (STE-24, merged PR #15) · **Date:** 2026-07-08

## Goal

The single approval surface in SoroSense: (a) approve a safe exit after the Sentinel
freezes a pool, (b) a prominent freeze status banner, (c) withdraw signing. Auto-compound
and auto-rebalance stay **silent** (activity entries only — never an approval prompt).
Requirements: R7, R9, R10, R13. Covers AE1, AE2.

## Scope decisions (confirmed with PM @axelmatsama)

1. **FreezeBanner location** — relocate the existing U14 `components/home/FreezeBanner.tsx`
   to the ticket-canonical **`components/status/FreezeBanner.tsx`** via `git mv` (one source,
   no duplicate). Update the import in `home/page.tsx`.
2. **Decline copy** — the exit sheet keeps an explicit Approve/Decline (required by the
   ticket), with the decline button reworded for clarity: **"Keep it paused"** (not the
   mockup's "Not now").
3. **Withdraw signing** — U14's `WithdrawKeypad` already signs via the shared
   `depositorSigner` + `signAndSubmit`. U15 does **not** refactor it; ExitApproval reuses the
   same signing pattern. (YAGNI — no shared `useSignAndSubmit` hook, no touching merged code.)
4. **Exit trigger** — both the home **FreezeBanner** and the Activity **"Review"** button open
   the same `ExitApproval` sheet (mockup-faithful; the banner opens the sheet directly rather
   than routing to activity).
5. **Copy tone** — **invisible-safety**, consistent with U14. No "Sentinel"/"risk" wording on
   any user surface (core invariant). Banner stays "Your earning is paused". Sheet explains the
   pause without naming the safety engine.

## Non-goals

- No rebalance-proposal UX. Auto-rebalance/auto-compound never prompt (they only appear as
  activity entries `rebalanced`/`compounded`, already seeded in `getActivity()`).
- No changes to `WithdrawKeypad`, `DepositKeypad`, or the vault seam (`packages/vault-client`).
- No risk label / tier / score anywhere (core invariant). The `ExitProposal` carries no risk field.

## Seam used (already present in `@sorosense/vault-client`)

- `pendingExit(currency): Promise<ExitProposal | null>` — `ExitProposal { id, currency, fromPool, toPool }`.
- `approveExit(depositor, exitId): PreparedTx` — depositor-signed; moves the bucket's active pool
  `fromPool → toPool` and clears the proposal.
- `poolStatus(pool)`, `activePool(currency)` — read the frozen state.
- `proposeExit(currency, fromPool, toPool): PreparedTx` — keeper-signed; used only by the dev seed.

No seam changes needed. All display data (pool name, target APY) is a **frontend** concern —
the proposal intentionally exposes only opaque pool ids.

## Architecture

### Data layer (mock / dev, all within-plan)

- **Seed** (`frontend/lib/vault/seed.ts`): after the existing `freeze(SEED_POOLS.EUR)`, add
  `proposeExit("EUR", SEED_POOLS.EUR, SEED_SAFE_EXIT.EUR)` (keeper-signed). New constant
  `SEED_SAFE_EXIT: Record<Currency, string>` with `EUR: "pool-defindex-eur"`. Now
  `pendingExit("EUR")` returns a proposal, driving the banner + sheet in the demo. Idempotent
  (the `balanceOf > 0` early-return already guards re-seeding).

- **Pool meta registry** (`frontend/lib/vault/data.ts`): `getPoolMeta(poolId): { name; apy } | null`
  mapping target/safe pools to display data, e.g. `pool-defindex-eur → { name: "DeFindex EURC",
  apy: 5.90 }`. Used to render the exit sheet's "To" node. **No risk field.** The "From" node is
  derived from the currency (`"Paused {SYM} pool"`) and the live bucket value.

- **Hook `usePendingExit()`** (`frontend/hooks/usePendingExit.ts`): the single source powering both
  the banner visibility and the sheet content. It scans currencies for a bucket whose active pool
  is `frozen`, reads `pendingExit(currency)` and `assetValueOf(user, currency)`, and returns:
  ```ts
  { currency: Currency; frozen: true; proposal: ExitProposal | null;
    fromLabel: string;      // "Paused EURC pool"
    toMeta: { name; apy } | null;
    amount: bigint }        // live bucket value (base units), from assetValueOf
    | null                  // no frozen bucket → banner hidden
  ```
  Re-reads on `version` (same dependency pattern as `useBuckets`).

- **`VaultProvider`**: add a `bump()` callback to the context (`setVersion(n => n + 1)`), alongside
  the existing `{ client, version }`. Called after a successful `approveExit` so `useBuckets` /
  `usePendingExit` re-read live — the banner disappears and the EUR bucket un-freezes without a
  navigation. Additive to the context shape; existing consumers (`{ client, version }`) are unaffected.

### Components

- **`components/status/FreezeBanner.tsx`** (relocated from `home/`, unchanged markup). Props stay
  `{ onReview: () => void }`. Home rewires `onReview` to open the sheet instead of routing.

- **`components/proposal/ExitApproval.tsx`** (new). Props `{ open, onClose }`. Renders inside the
  shared `BottomSheet` primitive (same pattern as `ConsentSheet`). Reads `usePendingExit()`,
  `useWallet()`, `useVault()`. State machine (per plan enumeration):

  | State | Condition | UI |
  |---|---|---|
  | frozen, not-yet-proposed | `frozen && !proposal` | interstitial "Preparing a safe exit…"; no Approve button |
  | exit proposed | `proposal` | From→To move card + rationale + **"Approve and sign in wallet"** / **"Keep it paused"** |
  | signing | `busy` (wallet popup open) | buttons disabled |
  | pending → confirmed | `approveExit(...).signAndSubmit(depositorSigner(...))` resolves | `bump()` → toast "Exit approved. Moving to a safe pool." → `onClose()` |
  | failed | throw | user-closed-modal → silent; other → toast `toWalletError(e).message`; sheet stays open |

  Decline ("Keep it paused") calls **no seam method** (funds never moved) → toast
  "Kept paused — your funds stay safe." → `onClose()`.

### Wiring

- **Home** (`app/(app)/home/page.tsx`): `const pend = usePendingExit()`;
  `{pend && <FreezeBanner onReview={() => setExitOpen(true)} />}`; mount `<ExitApproval open={exitOpen}
  onClose={() => setExitOpen(false)} />`. Replaces the `anyFrozen` visibility check.
- **Activity** (`app/(flow)/account/activity/page.tsx`): the `proposed-exit` row's "Review" button
  (`ActivityRow`, U14 placeholder) → `onReview={() => setExitOpen(true)}`; mount the same
  `<ExitApproval>`. This is the placeholder-wiring the ticket calls for.

## Copy (invisible-safety)

- **Banner** (unchanged from U14): title "Your earning is paused" · sub "Tap to review and approve the move".
- **Exit sheet** title: "Approve safe exit". Body: "We paused your EURC pool to keep it safe.
  Your funds are protected — approve moving them to a safe pool in the same currency."
- **Move card**: From "Paused EURC pool" + live value · To "DeFindex EURC" + "5.90% APY".
- **Footnote**: "Your funds stay safe either way. Nothing moves until you approve."
- **Interstitial**: "Preparing a safe exit… Your funds are protected in the meantime."
- **Toasts**: approve → "Exit approved. Moving to a safe pool." · decline → "Kept paused — your funds stay safe."
- No "Sentinel", no "risk", no risk tier/label/score anywhere.

## Design invariants honoured

- Monochrome + green/red/amber only (banner + sheet reuse `warn`/`warn-soft` tokens already in U14).
- DRY primitives — `BottomSheet`, `Button`, `Toast`, `CoinBadge`, `depositorSigner` reused; no per-screen restyle.
- Keeper-signing (`proposeExit`, `freeze`) is dev-seed only, never in a client approval path.
- Wallet signing is client-only (`"use client"` + `useWallet`); `KEEPER_SECRET` never in the client.
- Per-currency buckets — the exit moves EUR→EUR (same currency), never a conversion.

## Test scenarios (component tests vs `MockVaultClient`)

1. **AE2 — banner + protection**: freeze a pool → `usePendingExit()` non-null → banner renders;
   `assetValueOf` is **unchanged** after freeze (funds protected, not moved).
2. **Exit proposal**: with a seeded `proposeExit`, the sheet shows the From→To move, rationale,
   and both Approve + Decline actions.
3. **Approve path**: clicking Approve signs and submits `approveExit` → `pendingExit(currency)`
   becomes `null` and `activePool(currency)` equals `toPool`.
4. **AE1 — no silent-op prompts**: the `rebalanced`/`compounded` activity rows render **no** Review
   button and open **no** sheet.
5. **Decline**: "Keep it paused" calls no seam method; `pendingExit` and `assetValueOf` stay intact.
6. **Withdraw signing** (regression, from U14): withdraw still signs via `depositorSigner` — the
   shared signing pattern is unchanged.

## Files touched

| File | Change |
|---|---|
| `frontend/components/status/FreezeBanner.tsx` | `git mv` from `home/` (markup unchanged) |
| `frontend/components/proposal/ExitApproval.tsx` | **new** — exit-approval bottom sheet + state machine |
| `frontend/hooks/usePendingExit.ts` | **new** — single source for banner + sheet |
| `frontend/lib/vault/data.ts` | add `getPoolMeta(poolId)` |
| `frontend/lib/vault/seed.ts` | add `SEED_SAFE_EXIT` + `proposeExit("EUR", …)` |
| `frontend/providers/VaultProvider.tsx` | add `bump()` to context |
| `frontend/app/(app)/home/page.tsx` | use `usePendingExit`, open sheet from banner |
| `frontend/app/(flow)/account/activity/page.tsx` | wire "Review" → open sheet |
| tests | `ExitApproval.test.tsx`, `usePendingExit`/wiring coverage |

## Verification

`pnpm -C frontend test` + `pnpm -r typecheck` green; dev-browser e2e evidence (before/after
composite) per the `pr-e2e-evidence` template: freeze banner visible → tap → exit sheet → approve →
banner clears + bucket un-freezes; decline keeps it paused; no prompt on rebalance/compound rows.
