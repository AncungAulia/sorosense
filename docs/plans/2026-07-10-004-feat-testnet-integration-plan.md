---
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
execution: code
type: feat
product_contract_source: ce-plan-bootstrap
origin_ticket: STE-21
parent: STE-5
related: [STE-45, STE-46, STE-51, STE-39, STE-31, STE-41]
date: 2026-07-10
depth: deep
---

# feat: Integration on testnet — swap MockVaultClient for the live contract (U20)

## Summary

The demo runs entirely on `MockVaultClient` today: an in-memory vault whose `deposit()` mints shares
without debiting any token, whose reads never touch a chain, and whose writes emit placeholder XDRs.
STE-21 (U20, the backend track's tail, single-owner) converges that mock onto the **deployed testnet
contract** `CCK5G4FQ53Y7TIQY6CZLOSLCF5DKL44XV2LNFKCMHTSCWNWEAI3D457Y` and runs the full demo journey
end-to-end against it: deposit → allocate → auto-rebalance → freeze-on-anomaly → approve-exit → simulate.

A `RealVaultClient` adapter implements the existing `VaultClient` seam over generated bindings, selected
by config so **the mock stays the default for every unit test** (the 131 backend + frontend/vault-client
tests must stay green). The keeper signs with a backend-only key; depositors sign via their wallet.

Scoping this surfaced a load-bearing discovery (STE-45): **the backend has no HTTP surface at all**, so
no backend read reaches the frontend today, and the real contract *pulls* tokens on deposit — an empty
judge wallet panics at step one. This plan therefore also lands a thin **Hono** API exposing the
backend-only reads plus a **faucet** (STE-45, Opsi A: self-issued SAC + `mock_pool`, ACC'd), and wires
the frontend to read real balances. Phased so each phase is independently verifiable.

**Product Contract preservation:** bootstrap from ticket STE-21; no product behavior changes beyond
making the existing journey real. The one demo-scope change — **MXN drops from the live demo** (USD/EUR
only) — is inherited from `deploy.ts` origin scope and coordinated with STE-41, not invented here.

---

## Problem Frame

- **The mock hides every integration seam.** `MockVaultClient.deposit()` debits nothing; the real
  contract `transfer`s tokens from the depositor. Reads are in-memory; real reads need soroban RPC.
  Writes are placeholder XDRs; real writes must build, sign, and submit Stellar transactions.
- **Two swap points, both singletons:** `backend/src/tools/vault.ts` `getVaultClient()` and
  `frontend/providers/VaultProvider.tsx` `getSingleton()`. Both must become config-driven without
  breaking the mock-default test suites.
- **No HTTP surface (STE-45).** The backend has no Express/Fastify/Hono and no routes. Backend-only
  composed reads (holdings, activity, earnings, funding) cannot reach the frontend, and the faucet
  needs an endpoint. This is the same gap that blocks STE-41.
- **Empty wallets panic on deposit (STE-45).** Judges connect Freighter with no testnet USDC/EURC. A
  faucet must inject funds, and the frontend must read real trustline balances (today `getWalletBalance()`
  is a fixture) or the faucet mints into a void.
- **Read-shape drift.** `backend/src/api/earnings.ts` `valueUsd` uses `value × rate` without `÷ UNIT`
  (holdings.ts divides correctly) — ~1e7× too large against real amounts. Mock NAV math uses
  `VIRTUAL_OFFSET = 1n`; the contract config records `virtualOffset: 1000` — a potential share-price
  mismatch to reconcile.
- **Deferred readers now due.** `cost-basis.ts` (earnings) and `user-activity.ts` (STE-42 activity)
  both consume injected event streams whose real on-chain reader was explicitly deferred to U20.

---

## Requirements

- **R-INT1** — The backend and frontend transact against the deployed testnet contract through the
  existing `VaultClient` seam, selected by config. (R1–R15, R17.)
- **R-INT2** — The mock remains the default; every existing unit test stays green with no live network.
- **R-INT3** — `KEEPER_SECRET` and the faucet **issuer secret** are backend-only, loaded from env,
  never shipped to the client; the faucet button is env-gated (dead on mainnet).
- **R-INT4** — Depositor writes are signed by the user's wallet; keeper/agent writes by the backend key.
- **R-INT5** — The frontend reads **real** wallet balances and vault state; no fixture balances in the
  live path.
- **R-INT6** — Read outputs carry no `risk`/`label`/`score`/tier field; per-currency buckets are never
  converted; read surfaces never write on-chain.
- **R-INT7** — The full demo journey runs end-to-end on testnet: deposit → allocate → auto-rebalance →
  freeze → approve-exit → simulate; a keeper freeze reflects in the UI within one poll; no rebalance
  prompt; no risk label. (Covers AE1, AE2, AE4.)

---

## Key Technical Decisions

### KTD1 — `RealVaultClient` adapter in `packages/vault-client`, over generated bindings

A thin `RealVaultClient` implements the hand-written `VaultClient` interface over the generated client
in `packages/vault-client/bindings/` (emitted by `smart-contract/scripts/bindings.ts`). Reads return
`Promise<T>` directly (never `Result` — seam rule); writes return a `PreparedTx` that builds a real
soroban transaction. **vault-client must not depend on `backend`** — the adapter takes an injected
signer, not `KEEPER_SECRET`. Placed beside `mock.ts`; consumers never change an import (the whole point
of the seam). **ACC'd direction.**

### KTD2 — Injected signer strategy: keeper (backend) vs depositor (wallet)

`PreparedTx.signAndSubmit(signer)` already takes a signer. The adapter is constructed with a
submit-capable signer bound to context: the **backend** constructs `RealVaultClient` with a keeper
signer (backend key, from env) for agent writes; the **frontend** constructs it with a wallet signer
(`lib/wallet-real.ts`, Stellar Wallets Kit) for depositor writes. The adapter never holds a secret
itself. Submission to soroban RPC (simulate → assemble → send → poll) lives in the adapter.

### KTD3 — Config-driven selection, mock-default (protects the test suites)

`getVaultClient()` and `VaultProvider` return the mock unless integration env is present
(`VAULT_CONTRACT_ID` + `SOROBAN_RPC_URL` + `NETWORK_PASSPHRASE`, and `KEEPER_SECRET` for the backend).
Absent → mock. This keeps 131 backend + frontend/vault-client tests green with zero network and makes
the swap a deploy-time concern, not a code fork per consumer.

### KTD4 — Faucet: Opsi A (self-issued SAC + `mock_pool`), behind a thin Hono API

Per STE-45 (ACC'd): self-issued `USDC`/`EURC` SACs so the faucet can mint, with the token-agnostic
`contracts/mock_pool` as the venue (real Blend rejects non-Circle assets). The backend gains a **thin
Hono** HTTP surface exposing the backend-only composed reads (holdings/activity/earnings/funding) plus
`POST /faucet`. Hono chosen for a minimal TS-first footprint. Issuer secret is backend-only (env),
never client-side; the faucet button is env-gated. Contract-side asset issuance + `mock_pool` deploy is
**STE-46 (Ulin)**, a hard dependency for the faucet and journey.

### KTD5 — Reconcile read-shape drift explicitly, mock-verified

Fix `earnings.ts` `valueUsd` to divide by `UNIT` (mirror holdings.ts) with a regression test that
pins the correct magnitude. **Scale resolved** by the STE-31 review (PR #23): the contract's
`SHARE_PRICE_SCALE = 1_000_000_000` **equals** the seam's `1_000_000_000n` — no mismatch. The only
residual is `VIRTUAL_OFFSET` 1n (mock) vs `virtualOffset` 1000 (contract config); an empty bucket
prices at base scale either way, so it affects only first-deposit share rounding — low impact, decide
at execution (align the mock or document as test-harmless). See Open Questions.

**Reality from the STE-31 review (PR #23):** yield does **not** accrue on-chain yet — `total_assets`
moves only on deposit/withdraw — so the live `share_price` reads *exactly* the base scale and
`value_of == deposited`. Therefore `earned = value − contributions = 0` on live testnet: the Earn
"Total earned" / Growth surfaces read **$0.00** against the real contract. The journey is unaffected
(deposit → allocate → rebalance → freeze → exit → simulate need no yield; the simulator is a
deterministic projection, not a chain read). See Risks for the demo-narrative decision.

---

## High-Level Technical Design

Component shape after integration — one seam, two swap points, config-selected:

```mermaid
flowchart TB
  subgraph FE[Frontend]
    VP[VaultProvider] -->|env: real?| RC1[RealVaultClient]
    VP -->|else| MC1[MockVaultClient]
    RC1 -->|depositor wallet signer| WK[wallet-real.ts / Wallets Kit]
    FE -->|HTTP| API
    BTN[Get test funds btn env-gated] -->|POST /faucet| API
  end
  subgraph BE[Backend]
    GV[getVaultClient] -->|env: real?| RC2[RealVaultClient]
    GV -->|else| MC2[MockVaultClient]
    RC2 -->|keeper signer KEEPER_SECRET| KS[keeper key env]
    API[Hono thin API] --> HOLD[holdings/activity/earnings/funding reads]
    API --> FAUCET[POST /faucet · issuer secret env]
    RDR[on-chain event reader] --> COST[cost-basis / user-activity]
  end
  subgraph CHAIN[Testnet]
    VAULT[vault contract CCK5...]
    SAC[self-issued USDC/EURC SAC]
    POOL[mock_pool]
  end
  RC1 --> VAULT
  RC2 --> VAULT
  FAUCET --> SAC
  RDR --> VAULT
  VAULT --> POOL
```

Journey signing paths (who signs what):

```mermaid
sequenceDiagram
  participant U as Depositor (wallet)
  participant FE as Frontend
  participant BE as Backend (keeper)
  participant C as Vault contract
  U->>FE: deposit
  FE->>C: build tx, sign via wallet, submit
  BE->>C: allocate / rebalance / freeze / proposeExit (keeper-signed)
  U->>FE: approveExit
  FE->>C: wallet-signed
  Note over FE,BE: reads poll soroban RPC; freeze reflects within one poll
```

---

## Implementation Units

Grouped into phases. **Phase A** is the buildable core (mock stays default; typecheck/tests green).
**Phase B** adds the HTTP surface + faucet (depends STE-46). **Phase C** wires on-chain readers.
**Phase D** is the live-testnet journey (manual evidence). Parallel-safety noted per unit.

### U1. Generate + vet the TypeScript bindings

- **Goal:** Produce `packages/vault-client/bindings/` from the deployed contract's WASM and confirm the
  generated surface covers every `VaultClient` method.
- **Requirements:** R-INT1.
- **Dependencies:** none (needs `stellar` CLI + Rust toolchain locally).
- **Files:** run `smart-contract/scripts/bindings.ts`; generated output under `packages/vault-client/bindings/` (git-tracked or gitignored — decide in-unit, mirror repo convention); `packages/vault-client/package.json` (export path if needed).
- **Approach:** `npx tsx smart-contract/scripts/bindings.ts` (offline from WASM). Map each generated
  method to the hand-written interface; record any gap (missing view, differing arg shape) as an input
  to U2. No behavior yet.
- **Patterns to follow:** the `bindings.ts` header comment (kept in `bindings/` so it never clobbers
  interface/mock).
- **Test scenarios:** `Test expectation: none — generated artifact + manual surface audit.` Record the
  method-coverage checklist in the PR.
- **Verification:** bindings generated; every `VaultClient` method has a generated counterpart or a
  documented gap.

### U2. `RealVaultClient` adapter over the bindings

- **Goal:** Implement `VaultClient` over the generated client — reads via soroban RPC, writes as real
  `PreparedTx`, signer injected.
- **Requirements:** R-INT1, R-INT4, R-INT6.
- **Dependencies:** U1.
- **Files:** `packages/vault-client/src/real.ts` (new), `packages/vault-client/src/real.test.ts` (new),
  `packages/vault-client/src/index.ts` (export).
- **Approach:** Constructor takes `{ contractId, rpcUrl, networkPassphrase, signer }`. Reads
  (`balanceOf`, `sharePrice`, `assetValueOf`, `poolStatus`, `hasConsent`, `autoCompoundEnabled`,
  `activePool`, `pendingExit`) → simulate/read via RPC, decode to the seam's `bigint`/types, return
  `Promise<T>`. Writes (`deposit`, `withdraw`, `allocate`, …) → build tx, return `PreparedTx` whose
  `signAndSubmit(signer)` simulates → assembles → signs → sends → polls. **No `Result`, no `backend`
  import.** Amounts stay `bigint`. Guard: never log secrets.
- **Execution note:** Start test-first against a mocked RPC transport for the decode/shape contract;
  live RPC behavior is Phase D.
- **Patterns to follow:** `packages/vault-client/src/mock.ts` (method shapes, `PreparedTx` contract),
  `frontend/lib/wallet-real.ts` (Wallets Kit signing).
- **Test scenarios:**
  - Each read decodes a representative RPC response to the correct `bigint`/enum (mocked transport).
  - `PreparedTx.signAndSubmit` calls the injected signer and submits; a wrong-role signer is rejected
    mirroring the mock's guard.
  - A read returning no entry yields the seam's empty value (`0n` / `null`), never throws.
  - No `risk`/`label`/`score` field appears in any returned shape.
- **Verification:** `pnpm -C packages/vault-client typecheck && test` green; adapter satisfies
  `VaultClient` structurally (compile-time) with mocked-transport unit tests.

### U3. Config-driven selection — backend `getVaultClient()`

- **Goal:** Return `RealVaultClient` (keeper signer) when integration env is present, else the mock.
- **Requirements:** R-INT2, R-INT3.
- **Dependencies:** U2.
- **Files:** `backend/src/tools/vault.ts`, `backend/src/tools/vault.test.ts` (new/extend), env docs.
- **Approach:** Read `VAULT_CONTRACT_ID`/`SOROBAN_RPC_URL`/`NETWORK_PASSPHRASE`/`KEEPER_SECRET`. All
  present → construct `RealVaultClient` with a keeper signer built from `KEEPER_SECRET`. Any absent →
  mock (today's behavior). `KEEPER_SECRET` never leaves the backend.
- **Patterns to follow:** existing env reads (`REFLECTOR_API_URL`, `DEFINDEX_API_URL`), the singleton +
  `__resetVaultClient` shape.
- **Test scenarios:**
  - Env unset → returns a `MockVaultClient` (default preserved).
  - Env set (test doubles) → constructs the real client with a keeper signer; `KEEPER_SECRET` is not
    present on the returned object or any read output.
  - Partial env (missing `KEEPER_SECRET`) → falls back to mock, does not throw.
- **Verification:** backend suite stays green with env unset; selection logic covered.

### U4. Config-driven selection — frontend `VaultProvider`

- **Goal:** Frontend uses `RealVaultClient` (wallet signer) when public integration env is present,
  else the mock.
- **Requirements:** R-INT2, R-INT4.
- **Dependencies:** U2.
- **Files:** `frontend/providers/VaultProvider.tsx`, its test, `frontend/lib/wallet-real.ts` (signer adapter if needed).
- **Approach:** `NEXT_PUBLIC_VAULT_CONTRACT_ID`/`NEXT_PUBLIC_SOROBAN_RPC_URL`/passphrase present →
  construct `RealVaultClient` with a wallet signer over Wallets Kit; else mock singleton. **No secret
  on the client** — depositor signs in their wallet. Disjoint from U3 (frontend file) → parallel-safe.
- **Patterns to follow:** the existing `getSingleton()` + `bump()` provider; `wallet-real.ts` signing.
- **Test scenarios:**
  - Public env unset → mock singleton (e2e + dev unchanged).
  - Public env set (test double) → real client constructed with a wallet signer; no secret referenced.
- **Verification:** frontend suite + U17 e2e stay green with env unset.

### U5. Fix earnings `valueUsd` unit scaling + reconcile NAV constants

- **Goal:** Correct the `÷ UNIT` drift and document/reconcile mock-vs-contract NAV constants so real
  reads produce correct magnitudes.
- **Requirements:** R-INT5, R-INT6.
- **Dependencies:** none (touches `earnings.ts` + mock; disjoint from U2–U4) → **parallel-safe with U2**.
- **Files:** `backend/src/api/earnings.ts`, `backend/src/api/earnings.test.ts`; possibly
  `packages/vault-client/src/mock.ts` if the mock's `VIRTUAL_OFFSET` is reconciled.
- **Approach:** Apply `÷ UNIT` (`10_000_000n`) to `valueUsd` mirroring holdings.ts; add a regression
  test pinning the corrected magnitude (fails on the old `value × rate`). Separately, compare the
  mock's `VIRTUAL_OFFSET = 1n` to the contract's `virtualOffset: 1000` and `SHARE_PRICE_SCALE`; if the
  first-deposit share price diverges materially, either align the mock or record why the difference is
  test-harmless (Open Question).
- **Test scenarios:**
  - `getEarnings` value for a known balance × FX rate is the human-scale USD figure, not 1e7× it
    (regression that fails pre-fix).
  - FX-read failure still returns a typed error, not a silent $0 (existing invariant intact).
- **Verification:** earnings magnitude correct; NAV reconciliation decision recorded.

### U6. Real trustline / wallet-balance read (frontend)

- **Goal:** Replace the fixture `getWalletBalance()` with a real trustline balance read, so the faucet
  and deposit reflect actual funds.
- **Requirements:** R-INT5.
- **Dependencies:** U4 (real client/RPC available on the frontend).
- **Files:** `frontend/lib/vault/data.ts` (`getWalletBalance`), its consumers, test.
- **Approach:** Read the account's trustline balance for the currency's SAC via RPC/Horizon when
  integration env is present; keep the fixture only in mock mode. Zero balance is a first-class state
  (drives the faucet button's visibility). Must land **before** the faucet button (else mint-into-void).
- **Test scenarios:**
  - Mock mode → fixture balances unchanged (dev/e2e green).
  - Integration mode (mocked RPC) → returns the real trustline balance; a no-trustline account reads 0.
- **Verification:** balance reflects the chain in integration mode; fixture path preserved in mock mode.

### U7. Thin Hono HTTP surface for backend-only reads

- **Goal:** Expose the composed backend reads (holdings, activity, earnings, funding) over HTTP so the
  frontend can consume them at integration — the surface that does not exist today.
- **Requirements:** R-INT1, R-INT6.
- **Dependencies:** U3.
- **Files:** `backend/src/http/` (new: server + routes), `backend/src/http/*.test.ts`,
  `backend/package.json` (+`hono`).
- **Approach:** A minimal Hono app with read-only GET routes wrapping `getHoldings` / `getActivity` /
  `getEarnings` / `getFundingOptions`, returning their JSON as-is (already risk/label/score-free).
  Read-only — no route writes on-chain. `bigint` serialized as decimal strings at the boundary
  (mirror the U17 bridge convention). CORS for the frontend origin. Health route.
- **Patterns to follow:** the read APIs' existing signatures; U17 `bridge.ts` bigint-as-string boundary.
- **Test scenarios:**
  - Each route returns the underlying read's JSON with `bigint` as strings; no risk/label/score key.
  - A read returning a typed error surfaces as a non-200 with a shaped error body, not a silent 200.
  - Routes never invoke a write path (read-only guarantee).
- **Verification:** routes serve the reads; `pnpm -C backend test` green.

### U8. Faucet endpoint `POST /faucet`

- **Goal:** Mint self-issued testnet USDC/EURC to a requesting address so judges can deposit.
- **Requirements:** R-INT3.
- **Dependencies:** U7, **STE-46** (SAC ids + issuer secret), U6.
- **Files:** `backend/src/http/faucet.ts` (+route), test, env docs (`FAUCET_ISSUER_SECRET`, SAC ids).
- **Approach:** `POST /faucet { address, currency }` → ensure the address's trustline (or return a
  `changeTrust`-needed hint), then `StellarAssetClient.mint` from the issuer secret. **Issuer secret
  backend-only, env, never in a response.** Rate-limit per address. USD/EUR only (no MXN). The whole
  route is inert unless faucet env is set (dead on mainnet).
- **Test scenarios:**
  - Valid `{address, USD}` (mocked issuer client) → mint invoked with the USDC SAC; response carries no
    secret.
  - Unknown currency (e.g. MXN) → 4xx, no mint.
  - Repeated calls beyond the rate limit → throttled.
  - Faucet env unset → route disabled/404.
- **Verification:** mint path covered with a mocked issuer client; secret never serialized.

### U9. Frontend "Get test funds" button (env-gated) + reads over HTTP

- **Goal:** Surface the faucet in the UI when trustline balance is 0, and point frontend reads at the
  Hono surface where a backend composition is needed.
- **Requirements:** R-INT3, R-INT5.
- **Dependencies:** U6, U7, U8.
- **Files:** `frontend/` Add-funds/Deposit component(s), a small faucet client, test.
- **Approach:** Show the button only when integration env is set AND trustline balance is 0; call
  `POST /faucet`; refresh balance (U6) after. **Dead on mainnet** (env-gated, `NEXT_PUBLIC_E2E`
  pattern). Frontend consumes Hono reads where it currently can't compute client-side.
- **Test scenarios:**
  - Mock/mainnet mode → button absent.
  - Integration mode + zero balance → button shown; click calls `/faucet` then re-reads balance.
  - Non-zero balance → button hidden.
- **Verification:** button appears only in the gated state; e2e unaffected in mock mode.

### U10. On-chain event reader (earnings + activity)

- **Goal:** Feed `cost-basis.ts` (earnings) and `user-activity.ts` (STE-42) from real chain events
  instead of injected fixtures.
- **Requirements:** R-INT1, R-INT6.
- **Dependencies:** U2; **STE-51** for the `ConsentSet` event (blocks the `sign-mandate` kind).
- **Files:** `backend/src/chain/event-reader.ts` (new) + test; `backend/src/api/user-activity.ts`
  (extend `UserActionEvent` with an `auto-compound` kind — see below); wiring into `earnings.ts` /
  `activity-feed.ts` deps.
- **Contract event map (confirmed by the STE-31/STE-39 review, PRs #22/#23):**
  - `Deposit` / `Withdraw` → `VaultEvent` (cost-basis) **and** `UserActionEvent` deposit/withdraw. ✅
  - `ExitApproved` → `UserActionEvent` approve-exit. ✅ (already emitted)
  - `AutoCompoundSet { depositor, enabled }` → a **new** `UserActionEvent` kind `auto-compound` — Ulin
    intends it as a "Yours" row, but STE-42's model doesn't include it yet. **Add the kind** to
    `user-activity.ts` (`deriveUserActivity` maps it to a plain-language detail, e.g. "Turned auto-reinvest
    on/off"), with a matching `AutoCompoundSet` decode here.
  - `set_policy_consent` emits **no event today** → `sign-mandate` cannot be read from chain. Gated on
    **STE-51** (`ConsentSet`). Fallback if STE-51 slips: drop `sign-mandate` from the live feed
    (documented, not silently dropped — the fixture promises it, so prefer STE-51).
- **Approach:** Read the vault's event stream via RPC `getEvents`, decode to the existing `VaultEvent`
  (cost-basis) and `UserActionEvent` (activity) shapes — the pure derivations stay untouched except the
  additive `auto-compound` kind. Injected in integration mode; mock/fixtures remain for tests.
  Deterministic by the chain's monotonic seq.
- **Test scenarios:**
  - A representative raw event stream (mocked) decodes to the correct `VaultEvent` / `UserActionEvent`
    rows (incl. `auto-compound` from `AutoCompoundSet`), ordered by seq.
  - Deposit/Withdraw map to cost-basis contributions correctly (feeds existing earnings tests).
  - With STE-51 unmerged, `sign-mandate` is documented reader-unavailable, not silently dropped.
- **Verification:** readers produce the existing shapes (+ `auto-compound`) from mocked chain events;
  pure derivations otherwise unchanged.

### U11. Full testnet journey run + evidence

- **Goal:** Prove the demo journey end-to-end against the live contract and capture PR evidence.
- **Requirements:** R-INT7 (Covers AE1, AE2, AE4).
- **Dependencies:** U2–U10, **STE-46** (deployed SAC + `mock_pool`).
- **Files:** `docs/tests/linear-STE-21/` (evidence: steps, tx hashes, screenshots), runbook doc.
- **Approach:** With integration env set and testnet funded via the faucet: connect Freighter → faucet
  → deposit → keeper allocate → auto-rebalance → keeper freeze (anomaly) → approve-exit → simulate.
  Confirm a freeze reflects in the UI within one poll, no rebalance prompt appears, and no risk label
  shows on any surface. Record tx hashes + explorer links.
- **Execution note:** Manual live run (not a CI gate) — testnet resets ~quarterly; capture evidence at
  run time. Redeploy via `scripts/deploy.ts` if reset.
- **Test scenarios:** `Test expectation: manual e2e — the journey itself is the test.` Enumerate each
  journey step's expected on-chain + UI outcome in the evidence doc.
- **Verification:** journey completes on testnet; evidence attached to the PR (pr-e2e-evidence).

---

## Scope Boundaries

**In scope:** the vault swap core (U1–U6), the HTTP surface + faucet (U7–U9), on-chain readers (U10),
and the live journey (U11).

### Deferred to Follow-Up Work
- **Contract-side asset issuance + `mock_pool` deploy** → **STE-46** (Ulin). Hard dependency for U8/U11.
- **Real Blend pools** (vs `mock_pool`) → post-hackathon; `mock_pool` is the deliberate demo choice.
- **MXN in the live demo** → out of scope (USD/EUR only, origin `deploy.ts` scope). The simulator's MXN
  tab removal is **frontend (Ancung), coordinated with STE-41** — flagged, not built here.
- **STE-41 canonical-APY-via-read** → separate ticket; the Hono surface (U7) unblocks it but the
  frontend `BUCKET_META` removal is Ancung's.
- **Faucet issuer-key rotation / timelock, upgrade-behind-multisig** → post-hackathon hardening.

**Out of scope:** changing the Rust contract (live, Ulin's), redeploying the vault, mainnet.

---

## Verification Contract

- **Mock-default gate (CI):** `pnpm -r typecheck && pnpm -r test` green with **no** integration env —
  the 131 backend + frontend/vault-client suites unchanged. This is the non-negotiable regression gate.
- **Adapter contract:** `packages/vault-client` unit tests cover `RealVaultClient` read decode + write
  `PreparedTx` against a mocked transport.
- **HTTP surface:** backend route tests assert read-only JSON (bigint-as-string, no risk/label/score),
  faucet mint path with a mocked issuer client, secret never serialized.
- **Live journey (manual):** the full testnet journey with tx-hash + screenshot evidence in
  `docs/tests/linear-STE-21/`, per pr-e2e-evidence.
- **Secret hygiene:** grep the diff — `KEEPER_SECRET` / `FAUCET_ISSUER_SECRET` / issuer seed never in
  client code, responses, or commits.

## Definition of Done

- Backend + frontend transact against the deployed contract via the seam, config-selected; mock stays
  the default and all existing tests pass.
- Judges can fund an empty wallet (faucet) and complete deposit → allocate → auto-rebalance → freeze →
  approve-exit → simulate on testnet; a freeze reflects in the UI within one poll; no rebalance prompt;
  no risk label anywhere.
- Secrets backend-only; faucet dead on mainnet; reads read-only; buckets never converted.

---

## System-Wide Impact

- **Every consumer of the seam** is affected by construction, but the `VaultClient` contract is
  unchanged — the swap is config, not a signature change. `pnpm -r typecheck` catches any drift.
- **New backend dependency (`hono`)** and a new process surface (the HTTP server) — first API layer in
  the repo; note deploy/runbook.
- **Cross-team:** STE-46 (Ulin, contract assets/pool) blocks the faucet + journey; STE-51 (Ulin,
  `ConsentSet` event) unblocks the `sign-mandate` reader kind; STE-41 (Ancung, canonical APY) is
  unblocked by U7; the MXN-tab removal is Ancung's.

## Risks & Dependencies

- **No on-chain yield → live earned-history reads $0 (STE-31 review).** `share_price` stays at base
  scale until mark-to-market NAV ships, so the Earn "Total earned" / Growth surfaces show zero against
  the real contract. The journey is unaffected. **Demo-narrative decision:** lean on the deterministic
  simulator (projection, works live) for the "earning" story; optionally a test-only NAV lift for a
  screenshot; real accrual is post-hackathon. Do **not** fake earned on a user surface.
- **Testnet reset (~quarterly)** invalidates the deployed contract/SACs → redeploy via `scripts/deploy.ts`
  + STE-46 before a live run. The mock-default gate means code stays green regardless.
- **STE-46 not done** blocks U8/U11 — sequence Ulin's asset issuance early.
- **STE-51 not done** blocks the `sign-mandate` reader kind; fallback is to drop it from the live feed
  (documented). `AutoCompoundSet`, `ExitApproved`, `Deposit`, `Withdraw` events already exist.
- **Soroban RPC / signing specifics** (simulate→assemble→send→poll, fee bumps, trustline setup) are
  execution-time detail — build the adapter test-first against a mocked transport, resolve live
  behavior in Phase D.

## Open Questions (execution-time)

- **NAV first-deposit rounding:** the mock's `VIRTUAL_OFFSET = 1n` vs the contract's `virtualOffset:
  1000` — empty bucket prices identically (base scale), so this only affects first-deposit share
  rounding. Low impact; align the mock or document as test-harmless in U5. (Scale itself is **resolved
  — both 1e9**.)
- **Bindings artifact tracking:** commit `packages/vault-client/bindings/` or gitignore + generate on
  install? Decide in U1 per repo convention (generated-code policy).
- **Frontend read transport:** which frontend reads move to the Hono surface (U9) vs stay on the direct
  vault client — settle per surface as integration lands; does not block Phase A.
- **`sign-mandate` in the live feed:** depends on STE-51 (`ConsentSet`). If it slips, drop the kind
  from the live feed rather than fake it.
