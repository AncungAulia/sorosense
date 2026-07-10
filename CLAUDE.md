# SoroSense — monorepo

Non-custodial, mobile-first deposit-to-earn app on Stellar with an invisible Sentinel safety engine. An agent auto-allocates each currency bucket to the safest-highest yield; a Sentinel freezes toxic pools. Safety is invisible to the user. pnpm monorepo: `backend/`, `frontend/`, `landing-page/`, `packages/*`, `smart-contract/` (Cargo).

- Run `pnpm install` at the **repo root**, never `npm install` inside a package. One shared lockfile.
- Each track has its own guide — read the `AGENTS.md` / `CLAUDE.md` in the package you're working in (e.g. `frontend/`, `smart-contract/`).
- `docs/brainstorms/` — Product Contracts (WHAT). `docs/plans/` — implementation plans (HOW). Work is tracked in Linear (team `sorosense`); 1 unit = 1 branch = 1 PR, PRs use the `pr-e2e-evidence` template.

## Commands

- `pnpm -r typecheck` / `pnpm -r test` — whole workspace (backend + vault-client use `vitest`).
- `pnpm -C backend test` / `pnpm -C packages/vault-client test` — per package.
- Contract: `cargo test` in `smart-contract/`.
- **Typecheck is a hard gate.** `tsc` is strict with `noUncheckedIndexedAccess` — indexed access is `T | undefined`; prefer `[...arr].reverse()` / guards over `arr[i]` in a way that can leak `undefined`. Tests passing does NOT mean typecheck passes; run both.

## Core invariants (do not violate)

- **Per-currency buckets, never converted** — USD/EUR/MXN funds stay in their own bucket. Blending to USD is display-only (via Reflector FX), never a fund conversion.
- **Safety is invisible** — no risk label/tier/score is ever exposed on a user surface. No `risk`/`label`/`score` field on API results.
- **No chatbot** — the only AI-adjacent user surface is the deterministic `simulate()` projection (math, not an LLM).
- **Read surfaces are read-only** — `backend/src/api/*` and `backend/src/earnings/*` never move funds or write on-chain.
- **`KEEPER_SECRET` is backend-only** — never shipped to the client.

## The DRY seam — `packages/vault-client`

`src/interface.ts` is the single source of the vault's callable shape (`VaultClient`). Backend, frontend, and (via generated bindings) the contract all build against it — never re-declare vault types. `src/mock.ts` (`MockVaultClient`) implements it in-memory for development; generated testnet bindings swap in at integration without any consumer changing an import.

- **Seam reads return `Promise<T>` directly** (e.g. `balanceOf`, `sharePrice`, `assetValueOf`) — NOT `Result`. `Result` lives in `backend/src/lib/result.ts`; `packages/vault-client` must not depend on `backend`.
- Amounts/shares/prices are `bigint`. Share price is fixed-point `PriceRay` scaled by `SHARE_PRICE_SCALE`; base (no yield) == the scale. The mock mirrors the contract's virtual-offset NAV math and exposes a **test-only** `simulateYield(currency, amount)` to raise NAV without minting shares.
- **Auto-compound is a per-depositor economic preference, separate from consent** (STE-38/STE-40). `setAutoCompound(depositor, enabled)` (depositor-signed write) + `autoCompoundEnabled(depositor)` (read, **default true** — unset = ON). Toggling it never touches `setPolicyConsent`/`hasConsent` (the safety mandate, KTD3). Revoke = stop reinvest only; allocate/rebalance/freeze-exit are unaffected.

## Backend conventions

- Remote/network reads return the typed `Result<T>` (`backend/src/lib/result.ts`) — never throw; missing/stale reads are fail-closed in the Sentinel.
- Deterministic, injectable dependencies: pass a `clock: () => number` instead of calling `Date.now()` in module cores; pass event/data sources in rather than reading chain directly (real readers are deferred to integration).
- `backend/src/earnings/` — earnings-history capability: `cost-basis.ts` (reconstruct net contributions per (user,currency) from `Deposit`/`Withdraw` events), `snapshotter.ts` (record the global per-currency share-price time series + Day/Week/Month/Year bucketing). `backend/src/api/earnings.ts` (`getEarnings`) composes those with the vault seam and injected FX into the read-only, blended-USD deposited-Earn view (balance, value-weighted APY, total earned, cumulative-earned chart, per-month breakdown). Earned = native yield (`value − contributions`) summed to USD — FX movement is never earnings; a failed FX read returns a typed `Result` error, never a silent $0. Per-user earned attribution (the value×price − contributions timeline) lives here, not in the snapshotter.
- `backend/src/mastra/allocator.ts` — `classifyBucket` stays **pure and per-currency-bucket** (no per-depositor branch); the auto-compound preference is honored at the **effect layer**. `runAllocatorTick` optionally takes `depositors` + `autoCompoundEnabled` (the seam read); `gateCompound` fires `effects.compound(currency, pool, depositor)` only for ON depositors and is **fail-closed** — an unreadable preference is treated as OFF (never reinvest unverified). Omit both fields → legacy ungated pool-level compound. Rebalance/freeze-exit never pass through the gate.
- `backend/src/api/activity-feed.ts` (`getActivity`) — read-only source-of-truth for the Activity **All / Yours / Automated** tabs, so the frontend "Yours" filter stops depending on a fixture. Merges the agent feed (`backend/src/api/activity.ts` `ActivityLog`, now carrying `actor: 'you' | 'agent'`, default `'agent'`) with user actions derived from an injected `UserActionEvent` stream (`backend/src/api/user-activity.ts` `deriveUserActivity`, pure/deterministic like `cost-basis.ts`, real reader deferred to U20). `actor` maps to the tabs (unset=All, `'you'`=Yours, `'agent'`=Automated); `depositor` narrows only the user rows (agent rows are pool-level). Deterministic by monotonic seq, read-only, no risk/label/score field. Covers deposit/withdraw/sign-mandate/approve-exit.
- `backend/src/api/holdings.ts` (`getHoldings`) + `backend/src/api/funding.ts` (`getFundingOptions`) — read-only source-of-truth for the Home bucket rows and Add-funds list, so the frontend stops hardcoding venue/APY (`frontend/lib/vault/data.ts`). `getHoldings` is a drop-in superset of the frontend `BucketView`; both derive venue/kind/APY from `backend/src/api/venue-meta.ts` (`resolveVenue`/`bestSafeVenue`/`kindLabel`, catalog-derived, the DRY seam between the two). RWA funding options omit APY; no risk/label/score field anywhere.
