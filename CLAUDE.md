# SoroSense — agent guide

Non-custodial, mobile-first deposit-to-earn app on Stellar. An agent auto-allocates each currency bucket to the safest-highest yield; a Sentinel freezes toxic pools. Safety is invisible to the user.

## Monorepo layout (pnpm workspace)

- `backend/` — Mastra agent, Sentinel risk engine, read-only APIs (`@sorosense/backend`).
- `frontend/` — Next.js mobile app (UI source of truth: `docs/mockups/sorosense-mock.html`).
- `landing-page/` — marketing site.
- `packages/vault-client/` — **the shared vault seam** (`@sorosense/vault-client`), see below.
- `smart-contract/` — Soroban vault (separate Cargo project; live on testnet, upgradable).
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

## Backend conventions

- Remote/network reads return the typed `Result<T>` (`backend/src/lib/result.ts`) — never throw; missing/stale reads are fail-closed in the Sentinel.
- Deterministic, injectable dependencies: pass a `clock: () => number` instead of calling `Date.now()` in module cores; pass event/data sources in rather than reading chain directly (real readers are deferred to integration).
- `backend/src/earnings/` — earnings-history capability: `cost-basis.ts` (reconstruct net contributions per (user,currency) from `Deposit`/`Withdraw` events), `snapshotter.ts` (record the global per-currency share-price time series + Day/Week/Month/Year bucketing). `backend/src/api/earnings.ts` (`getEarnings`) composes those with the vault seam and injected FX into the read-only, blended-USD deposited-Earn view (balance, value-weighted APY, total earned, cumulative-earned chart, per-month breakdown). Earned = native yield (`value − contributions`) summed to USD — FX movement is never earnings; a failed FX read returns a typed `Result` error, never a silent $0. Per-user earned attribution (the value×price − contributions timeline) lives here, not in the snapshotter.
