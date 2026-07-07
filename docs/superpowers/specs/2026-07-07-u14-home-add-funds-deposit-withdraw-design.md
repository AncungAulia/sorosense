# U14 — Home + Add funds + Deposit + Withdraw (design)

- **Linear:** STE-24 (parent STE-7). Depends U13 (STE-23, merged #14). Blocks U15 (STE-25); related U20 (STE-21).
- **Design source of truth:** `docs/mockups/sorosense-mock-2.html`.
- **ACC:** Axel (@axelmatsama) 2026-07-07 — mock-2, deposit full-page keypad, withdraw bucket picker, View all → `/account/activity`, amber freeze note via seam, MOCK data via `MockVaultClient`, sign via wallet U13.
- **Status of this spec:** approved verbally 2026-07-07. One sub-decision (RWA section in Add funds) is gated on an Axel reply — see §10.

## Goal

Ship the core deposit-to-earn surfaces from mock-2 against the mock vault seam: Home (per-currency buckets + agent-activity preview + View all), Add funds (fundable stablecoin picker), Deposit (full-page keypad, one-time consent, no risk tier), Withdraw (bucket picker keypad). Data is mocked now (`@sorosense/vault-client`'s `MockVaultClient` + frontend fixtures); live wiring is deferred to U15/U17/U20.

Requirements covered: R1, R2, R3, R5, R7, R14, R19, R23, R24.

## Invariants (must hold)

- Monochrome + green/red/amber only. **No risk label/tier/score anywhere** — Deposit has amount + Confirm + footnote only.
- Per-currency buckets, **never converted**. "All buckets" USD total is a **display-only** blend via a fixture FX rate (mirrors Reflector later), never a fund conversion. Copy: "Goes to your X bucket. No conversion."
- No chatbot; agent actions are plain activity entries. No hub/explore catalog — Add funds shows only fundable currencies (R19).
- Consent is a single one-time safety mandate (KTD3) — no tier argument.
- Reuse U13 primitives; **do not re-style primitives per screen** (DRY).
- `KEEPER_SECRET`/keeper signing never on the client. Only depositor-signed writes here.

## Architecture

### Routing (Next.js App Router)

Real routes (not client overlays), consistent with U13. Two route groups share one auth gate:

- **`app/(app)/`** — tabbed shell with `BottomNav`: `home`, `earn`, `account` (existing).
- **`app/(flow)/`** — full-page sub-screens: back header, **no** `BottomNav`, slide transition:
  - `add-funds/page.tsx` → `/add-funds`
  - `deposit/[sym]/page.tsx` → `/deposit/usdc|eurc|cetes`
  - `withdraw/page.tsx` → `/withdraw`
  - `account/activity/page.tsx` → `/account/activity` (route groups are URL-transparent, so this yields the exact URL Axel asked for while using the flow layout, not the tabbed one)

Refactor (targeted): extract the `!isConnected → router.push("/")` gate from `(app)/layout.tsx` into a shared `AuthGate` (component or hook in `frontend/components` / `frontend/hooks`) used by both group layouts, so the flow screens are auth-gated without duplicating logic.

> Next 16 is not the Next.js in training data — read `node_modules/next/dist/docs/` before writing route/layout code (AGENTS.md).

### Data layer ("mock dulu", single seam-swap point)

- Add `@sorosense/vault-client` as `workspace:*` dependency of `frontend`.
- **`frontend/providers/VaultProvider.tsx`** — provides ONE shared `MockVaultClient` singleton (client-side, `"use client"`) so a deposit is immediately reflected on Home. Exposes the client + the fixture data provider via context; `useVault()` hook mirrors `useWallet()`.
- **Boot seed (dev-only, clearly marked, removed/replaced at integration):** seed the singleton so the app opens in a realistic funded state and every test scenario is reachable — seed a USD deposit and an EUR deposit (≥2 buckets → withdraw chevron shows), set `activePool` per currency, `freeze` the EUR pool (drives the amber deposit note + Home freeze banner), and a small `simulateYield` per bucket (non-zero earned/APY display). Seeding lives in the data module, not scattered.
- **`frontend/lib/vault/data.ts`** — fixture provider whose types and seed figures **mirror the backend shapes** so the later swap is a one-file change:
  - `getBuckets()` venue/APY/tags — shape mirrors `CatalogEntry` (`backend/src/tools/catalog.ts`): DeFindex USDC 8.59% (vault), Blend USDC 6.6% (lending), Blend EURC 5.1%, Etherfuse CETES 5.57%, Ondo USDY 4.65%.
  - `getActivity()` — shape mirrors `ActivityEntry`/`ActivityKind` (`backend/src/api/activity.ts`): `allocated|compounded|rebalanced|froze|proposed-exit`, plain-language `detail`, no risk label. Include a `cat: 'you' | 'auto'` facet for the Activity filter (mock-2 filters All/Yours/Automated).
  - `getFxRate(currency)` — fixture EUR→USD / MXN→USD for the display-only blended total.
- **`frontend/lib/vault/signer.ts`** — `depositorSigner(address, signTransaction)` returns `Signer { role: 'depositor', address, sign: signTransaction }`, bridging U13's `wallet.signTransaction` to the seam's `Signer`.
- **Read hooks** (`frontend/hooks/useBuckets.ts`, `useActivity.ts`) compose seam reads (`balanceOf`, `assetValueOf`, `activePool`, `poolStatus`, `hasConsent`, `pendingExit`) with fixture metadata and expose `{ loading, error, data }`.

### Components

Reuse (no re-style): `Button` (ink/glass), `Card`, `Chip`, `BottomSheet`, `Toast`, `BottomNav`.

New shared primitives (extracted once):
- `components/ui/Keypad.tsx` — amount display (big number + blinking caret), quick-fill pills, digit grid + `.` + backspace. Controlled via `value`/`onChange`; used by **both** Deposit and Withdraw.
- `(flow)` layout / `components/ui/SubScreenHeader.tsx` — centered title + back button.
- `components/bucket/BucketRow.tsx` — coin badge, bucket name, venue tags (`Chip`), balance, APY.
- `components/activity/ActivityList.tsx` + `ActivityRow.tsx` — icon, detail, relative time, optional "Review" affordance; used by Home preview and Activity page.

Feature components (file names per ticket):
- `components/deposit/AddFunds.tsx`, `components/deposit/DepositKeypad.tsx`, `components/deposit/ConsentSheet.tsx`.
- `components/withdraw/WithdrawKeypad.tsx` (+ bucket picker pill).
- `components/home/*` — Home composition (total hero + bucket toggle, `FreezeBanner`, buckets, activity preview).
- `app/(app)/earn/page.tsx` — **minimal funded stub only**: balance hero + `Deposit` + `Move to wallet` buttons (hosts the withdraw entry). Simulator/growth/breakdown remain U16; build so U16 extends, not rewrites.

## Feature flows

### Deposit + consent (KTD3)

1. `/add-funds` lists fundable stablecoins → tap `USDC` → `/deposit/usdc`.
2. Keypad screen: title "Deposit USDC", balance pill, **amber note** iff `activePool('USD')` resolves and `poolStatus(pool) === 'frozen'` ("Your USDC pool is paused. New deposits go to a safe pool."), amount, quick-fill (% of wallet balance), footnote. **No risk-tier control.**
3. Tap "Deposit fund":
   - If `!hasConsent(address)` → open `ConsentSheet` (one-time safety mandate explainer, no tier) → "Agree & sign" → `setPolicyConsent(address).signAndSubmit(depositorSigner)` **then** the deposit sign → **two signatures on the first deposit**.
   - Else → `deposit(address, currency, amount).signAndSubmit(depositorSigner)` directly.
   - Success → toast "Deposited. Agent is allocating." → navigate to `/home`; balance reflects the new deposit.
   - Error → normalize via `lib/wallet-error.ts`; `USER_CLOSED_MODAL` (code −1) is a silent no-op, other errors show an error toast.

Amount → base units: parse the entered decimal to the stablecoin's base-unit `bigint` (`Amount`). Wallet balances for the % quick-fill come from the fixture (`getWalletBalance(sym)`), a real wallet read is deferred.

### Withdraw

Entry: Earn stub "Move to wallet" → `/withdraw`. Bucket picker pill cycles currencies with a positive balance; **chevron rendered only when ≥2 fundable buckets**. Available = `assetValueOf(address, currency)`. Keypad amount.

Amount→shares conversion (seam `withdraw` is share-denominated, UI is asset-denominated): `shares = amount * SHARE_PRICE_SCALE / sharePrice(currency)`; **"Max" uses `balanceOf` (full shares)** to avoid rounding dust. Confirm → `withdraw(address, currency, shares).signAndSubmit(depositorSigner)` → toast "Sent to your wallet" → back to Home.

### Freeze — U14 vs U15 boundary

- **Deposit amber note** — U14. Reads `activePool(currency)` + `poolStatus(pool)`.
- **Home `FreezeBanner`** — U14, **display-only**: shown when a currency's active pool is frozen or `pendingExit(currency)` exists; tapping navigates to `/account/activity` (in-scope). The full **Approve-safe-exit sheet** (mock-2's exit drawer) is **U15 (STE-25)** and is NOT built here.

### Home & Activity

- Home: total-value hero with a bucket toggle ("All buckets" = display-only blended USD via `getFxRate`; per-bucket shows native currency), `FreezeBanner`, "Add funds" button, Buckets card (`BucketRow` per funded currency), "Agent activity" preview (top 3) + "View all activity" → `/account/activity`.
- Activity page: segmented filter All / Yours / Automated over `getActivity()`.

## Testing

Vitest + Testing Library (U13 pattern), plus e2e evidence for the PR.

- Home renders seeded buckets + activity preview + a "View all" link to `/account/activity`.
- Add funds lists only fundable stablecoins (USDC/EURC/CETES); no explore/RWA catalog (pending §10).
- Deposit keypad has **no risk-tier control**; digit entry works; "Max" fills the wallet balance; amber note appears when the currency's active pool is frozen and is absent otherwise.
- First deposit triggers a consent signature **then** a deposit signature (spy on `depositorSigner.sign` / `mockSigner`); a subsequent deposit signs once.
- A deposit updates the bucket balance shown on Home (shared singleton).
- Withdraw bucket picker: chevron only with ≥2 buckets; "Max" withdraws full shares; sign path resolves.
- Loading / empty (no buckets) / error states render.
- e2e: capture at a **desktop viewport** — Freighter does not inject under DevTools device-mode mobile UA (kit shows "Install"); normalize kit plain-object rejections.

## Out of scope (this unit)

- Approve-safe-exit sheet + freeze-status detail + withdraw-signing hardening → **U15 (STE-25)**.
- Full Earn page (simulator, growth chart, breakdown) + full Account UI → **U16**.
- Real contract/backend wiring, live APY/TVL/activity, real FX → **U20 (STE-21)** / U17.
- `RWA` "Real world assets" section in Add funds → **gated on Axel** (§10).

## §10 — Open item (Axel ACC pending)

RWA section in Add funds: mock-2 shows a "Real world assets" list (USDY, CETES-bond), but R19 + STE-7 invariant say Add funds shows only fundable currencies with no explore catalog. Posted to STE-24 (2026-07-07). Default = **stablecoins only**; add RWA only if Axel confirms. The design is unaffected either way — RWA would be an extra section in `AddFunds.tsx`.
