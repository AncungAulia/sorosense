---
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
execution: code
type: feat
product_contract_source: ce-plan-bootstrap
origin_ticket: STE-21
related: [STE-42, STE-39, STE-51]
umbrella_plan: docs/plans/2026-07-10-004-feat-testnet-integration-plan.md
date: 2026-07-13
depth: standard
---

# feat: Testnet integration Fase C+D (backend) — on-chain event reader + keeper runner

## Summary

Fase A/B (merged) made the seam read the live contract, exposed the reads over HTTP, and funded wallets
via the faucet. **Fase C+D backend** adds the two remaining backend pieces toward the live demo journey:

- **Fase C — on-chain event reader**: poll soroban `getEvents` for the vault, decode contract events, and
  feed the existing pure derivations — `cost-basis.ts` (earnings) and `user-activity.ts` (activity
  "Yours"). This turns the injected-fixture history real. `UserActionEvent` gains an `auto-compound` kind
  (STE-39's `AutoCompoundSet`) and now sources `sign-mandate` from `ConsentSet` (STE-51).
- **Fase D — keeper runner**: a **manually-invoked** runner/CLI that drives the deterministic
  `runAllocatorTick` against testnet with real keeper writes (allocate / rebalance / freeze / propose-exit)
  via the keeper signer + the Fase B pool registry. This is what "moves the agent" on the demo stage.

**Out of this backend plan** (frontend / manual, coordinated): the depositor deposit signed by a real
wallet, and the full end-to-end journey run — those live in the frontend track (STE-52) + a manual demo.
This plan **sharpens Fase C/D of the umbrella plan** (`docs/plans/2026-07-10-004-…`); it does not
duplicate it.

**Product Contract preservation:** bootstrap from STE-21; no product behavior changes — the reader makes
existing surfaces real, the runner drives the existing deterministic allocator.

---

## Problem Frame

- **History is still fixture-fed.** `cost-basis.ts` and `user-activity.ts` are pure over an injected
  event list; the real on-chain reader was deferred to U20. Without it, earnings + Activity "Yours" are
  empty (or fixture) against the live contract.
- **`UserActionEvent` is out of date.** It models deposit/withdraw/sign-mandate/approve-exit but not the
  `auto-compound` toggle, which STE-39 emits as `AutoCompoundSet` and intends as a "Yours" row; and
  `sign-mandate` now has a real event (`ConsentSet`, STE-51) rather than the earlier "no event" gap.
- **Nothing drives the keeper live.** The allocator (`classifyBucket` + `runAllocatorTick`) is
  deterministic and tested, but no process calls it against testnet — so on the demo stage nothing
  allocates, rebalances, or freezes. The keeper signer (Fase A) + pool registry (Fase B) exist; a runner
  that wires them into real `AllocatorEffects` is missing.

---

## Requirements

- **R-C1** — A backend reader polls the vault's on-chain events and decodes them to the existing
  `VaultEvent` (cost-basis) and `UserActionEvent` (activity) shapes, deterministically ordered.
- **R-C2** — `UserActionEvent` covers `auto-compound` (`AutoCompoundSet`) and `sign-mandate`
  (`ConsentSet`); the pure `deriveUserActivity` maps every kind to a plain-language, risk-word-free detail.
- **R-D1** — A manually-invoked keeper runner drives `runAllocatorTick` with real effects that call the
  keeper writes against testnet, resolving pool slugs to Addresses via the injected registry.
- **R-INV** — Mock stays the default; the offline suite stays green with no network. Secrets
  (`KEEPER_SECRET`) backend-only. Reads read-only; no risk/label/score field; per-currency buckets never
  converted.

---

## Key Technical Decisions

### KTD1 — Reader decodes raw events by topic, injectable RPC

The reader takes an injected `getEvents`-shaped source (real: `stellar-sdk` `rpc.Server.getEvents`
filtered to the vault contract; tests: a fake returning canned event pages). It decodes each event by its
**topic symbol** (`Deposit`, `Withdraw`, `ConsentSet`, `AutoCompoundSet`, `ExitApproved`) + data into the
seam's `VaultEvent` / `UserActionEvent` — it does **not** depend on generated binding event types (events
are read from XDR, not called). Deterministic by the event ledger sequence. The pure derivations
(`reconstructCostBasis`, `deriveUserActivity`) are untouched except the additive `auto-compound` kind.

### KTD2 — Keeper runner is a manual CLI over real effects (Opsi a, ACC'd)

A runner builds `AllocatorEffects` whose `compound`/`rebalance`/`freezeExit` call the real
`RealVaultClient` keeper writes (signed by the keeper), then a thin CLI triggers one action on command
(`freeze <currency>`, `tick <currency>`, …). Deterministic + operator-controlled for a stage demo — no
autonomous loop, no live anomaly signal to fake. Pool slugs resolve to Addresses through the Fase B
registry, built here from env (`BLEND_POOL_USD`/`EUR`), settling the Fase B open question: the demo pool
per currency maps to that env address.

### KTD3 — `classifyBucket` stays pure; the runner is the effect layer

The runner does not change allocator logic — it supplies live `candidates`/`activeRay`/`anomaly` inputs
(from reads / operator flags) and injected real effects. This preserves the pure, per-currency-bucket
decision core (KTD3 of the allocator) and keeps the runner testable with mock effects.

---

## Implementation Units

**U1 ∥ U2** are file-disjoint (chain/ + api/user-activity vs keeper/) → parallel-safe. **U3** is manual
live evidence after both.

### U1. On-chain event reader (feeds earnings + activity)

- **Goal:** Decode the vault's on-chain events into `VaultEvent` + `UserActionEvent`, replacing injected
  fixtures at integration; extend `UserActionEvent` with `auto-compound`.
- **Requirements:** R-C1, R-C2, R-INV.
- **Dependencies:** none (new `backend/src/chain/` + additive change to `user-activity.ts`).
- **Files:** `backend/src/chain/event-reader.ts` (+ `backend/src/chain/event-reader.integration.test.ts`);
  `backend/src/api/user-activity.ts` (+ its test) — add the `auto-compound` kind + its detail.
- **Approach:** An injectable `EventSource` (`getEvents(cursor?) → { events, latestLedger }`). Decode each
  event by topic symbol → the right `VaultEvent` (deposit/withdraw with amount+shares) and/or
  `UserActionEvent` (deposit/withdraw/sign-mandate/approve-exit/auto-compound). Real source wraps
  `rpc.Server.getEvents` (contract filter, ledger paging); tests inject canned pages. Order by ledger
  seq. Extend `UserActionEvent` union with `{ kind: 'auto-compound'; depositor; enabled; seq; ts? }` and
  give `deriveUserActivity` a detail (e.g. "Turned auto-reinvest on/off") — additive, existing kinds
  unchanged.
- **Patterns to follow:** `backend/src/earnings/cost-basis.ts` (VaultEvent shape, seq ordering);
  `backend/src/api/user-activity.ts` (UserActionEvent + detail convention); `backend/src/tools/*` env/RPC
  wiring.
- **Test scenarios (integration, object-real with a fake EventSource):**
  - A canned page with a Deposit + Withdraw decodes to the correct `VaultEvent` rows (amount, shares,
    depositor, currency), seq-ordered; these feed `reconstructCostBasis` correctly.
  - The same page's user actions decode to `UserActionEvent` rows incl. `auto-compound` (from
    `AutoCompoundSet`) and `sign-mandate` (from `ConsentSet`); `deriveUserActivity` yields risk-word-free
    details for every kind.
  - Paging: two pages via cursor accumulate in seq order with no dupes.
  - An unknown/irrelevant event topic is ignored, not mis-decoded.
- **Verification:** reader produces the existing shapes (+ `auto-compound`) from canned events;
  `pnpm -C backend test` green.

### U2. Keeper runner + CLI (drives the allocator live)

- **Goal:** A manually-invoked runner that executes real keeper writes against testnet through the
  deterministic allocator tick.
- **Requirements:** R-D1, R-INV.
- **Dependencies:** none (new `backend/src/keeper/` — disjoint from U1).
- **Files:** `backend/src/keeper/runner.ts` (real `AllocatorEffects` + a `runKeeperTick`/action fns),
  `backend/src/keeper/cli.ts` (thin arg parse → action), `backend/src/keeper/runner.test.ts`.
- **Approach:** Build `AllocatorEffects` whose methods call `getVaultClient()`'s keeper writes
  (`allocate`/`rebalance`→deallocate+allocate or the seam's rebalance path/`freeze`+`proposeExit`), each
  signed by the keeper signer (already wired in `tools/vault.ts` when integration env is set). Build the
  pool registry (`resolvePool`) from env and pass it to the client (the client is constructed in
  `tools/vault.ts`; thread the registry there). The CLI exposes discrete operator actions — at minimum
  `freeze <currency>` and a single `tick <currency>` that runs `runAllocatorTick` with supplied
  candidates. Guard: refuse to run real writes unless integration env is present (else print a clear
  "mock mode, nothing to drive").
- **Patterns to follow:** `backend/src/mastra/allocator.ts` (`runAllocatorTick`, `AllocatorEffects`,
  `InMemoryBucketStore`); `backend/src/tools/keeper-signer.ts`; the Fase B registry injection.
- **Test scenarios (integration, mock effects/vault):**
  - `freeze <currency>` action → the keeper `freeze` write is invoked with the resolved pool Address (via
    a spy vault), signed keeper-role; a depositor-role signer is rejected.
  - A `tick` with a candidate set → `runAllocatorTick` drives exactly the expected effect (rebalance vs
    compound vs freeze) per the pure classify, with real-effect wiring mocked.
  - Mock mode (no integration env) → the runner refuses real writes / no-ops with a clear message.
- **Verification:** runner drives the right effect with mocked writes; `pnpm -C backend test` green.

### U3. Live smoke — reader + keeper on testnet (evidence)

- **Goal:** Prove both against the live contract.
- **Requirements:** R-C1, R-D1.
- **Dependencies:** U1, U2, integration env.
- **Files:** `docs/tests/linear-STE-21/fase-cd-smoke-evidence.md`.
- **Approach:** (reader) poll the live vault's events and confirm a real `Deposit` (from STE-46's live
  deposit) decodes to a `VaultEvent`. (keeper) run the CLI `freeze <currency>` against testnet →
  `poolStatus` reads `frozen`; then `unfreeze` → `active` (safe, no funds moved, reversible). Capture tx
  hashes.
- **Test scenarios:** `Test expectation: manual smoke — live decode + a reversible freeze are the evidence.`
- **Verification:** a live event decodes; a live freeze/unfreeze round-trips; hashes recorded in the PR.

---

## Scope Boundaries

**In scope:** U1 (reader) + U2 (keeper runner) + U3 (live smoke) — backend.

### Deferred to Follow-Up Work
- **Depositor deposit via real wallet + full journey run** → frontend (STE-52) + manual demo; the adapter
  `deposit` PreparedTx is ready, the wallet-signing + end-to-end run are Ancung's + a live drive.
- **Autonomous keeper loop / real anomaly signal** → post-hackathon; the demo uses the manual CLI.
- **Wiring the reader into the live HTTP surface** (replacing the empty history sources in `server.ts`) →
  a small follow-up once the reader lands; keep it behind integration env.

**Out of scope:** changing the Rust contract, mainnet, frontend.

---

## Verification Contract

- **Mock-default gate (CI):** `pnpm -r typecheck && pnpm -r test` green with no integration env — the
  offline suite unchanged.
- **Integration tests (object-real):** U1 decodes canned event pages through the real pure derivations;
  U2 drives `runAllocatorTick` with a spy vault + mock effects.
- **Live smoke (manual):** a real event decodes; a reversible keeper freeze/unfreeze on testnet, tx hashes
  in the PR.
- **Secret hygiene:** `KEEPER_SECRET` never in client code, responses, logs, or commits.

## Definition of Done

- The reader decodes the vault's on-chain events into the existing shapes (+ `auto-compound`), feeding
  earnings + activity from chain instead of fixtures.
- A manual keeper CLI performs real keeper writes (freeze proven live) through the deterministic allocator.
- Mock stays default; offline tests green; each backend unit has an object-real integration test; secrets
  backend-only.

---

## System-Wide Impact

- **`UserActionEvent` gains a kind** (additive) — the pure `deriveUserActivity` + the STE-42 activity feed
  pick it up; `pnpm -r typecheck` catches any consumer.
- **New backend surfaces:** `backend/src/chain/` (reader) + `backend/src/keeper/` (runner/CLI). The runner
  performs real on-chain writes — operator-run only, env-guarded.
- **Cross-team:** unblocks the live journey once STE-52 (frontend deposit/faucet UI) lands; the keeper CLI
  is what I drive on stage alongside Ancung's UI.

## Risks & Dependencies

- **Keeper writes mutate live state** — the runner is env-guarded and the smoke uses only a reversible
  freeze/unfreeze (no funds moved). Allocate-live is exercised in the manual journey, not an automated smoke.
- **`getEvents` retention** — testnet RPC keeps events for a bounded window; the reader pages from a cursor
  and tolerates gaps (history reconstruction is best-effort for the demo).
- **Bindings freshness** — if the contract was re-upgraded after the committed bindings, regenerate; the
  reader decodes raw event XDR so it is resilient to binding drift, but the write adapter is not.

## Open Questions (execution-time)

- **Rebalance path in the runner:** the seam has no single `rebalance` write — a rebalance is
  deallocate+allocate (or proposeExit+approve). Settle the exact sequence in U2 against the contract; the
  demo may only need `freeze` + `allocate`.
- **Event data decoding specifics** (i128/Address/Symbol ScVal → JS) — resolve in U1 against a real
  `getEvents` sample; keep the decode helpers small and unit-covered.
