---
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
execution: code
type: feat
product_contract_source: ce-plan-bootstrap
origin_ticket: STE-21
date: 2026-07-13
depth: standard
---

# feat: API QA for the HTTP surface — OpenAPI + Bruno + Schemathesis + K6

## Summary

Fase B added the backend's first HTTP surface (a thin Hono read layer + faucet). This unit gives it the
QA the team standard asks for, **adapted to this stack** (Hono + zod + on-chain state — no DB/ORM, so
Drizzle/Testcontainers/repository/DTO-class-validator/Inngest/user-staff are out of scope, N/A here):

- **OpenAPI 3.1 spec** for every route, served with **Swagger UI**, kept honest by a conformance test.
- **Bruno** collection (`.bru`) — the team uses Bruno, not Postman — committed for manual/CLI runs.
- **Schemathesis** property/fuzz test against the OpenAPI spec + a booted mock-mode server (via `uvx`).
- **K6** load test over the read endpoints, with a captured summary.

Schemathesis + K6 are **run tools + evidence** (like the live smokes), not CI gates — there is no CI
infra. The offline vitest suite stays the CI gate and stays green.

## Problem Frame

- The Hono routes have **no machine-readable contract** — no OpenAPI, so no Swagger UI, no Bruno export,
  and nothing for Schemathesis to fuzz against.
- The API has **never been load-tested** (K6) or **property-tested** (Schemathesis) — only example-based
  vitest integration tests.
- The team standard names Bruno (not Postman) + Schemathesis + K6 explicitly; the surface now exists to
  apply them.

## Requirements

- **R-Q1** — An OpenAPI 3.1 document describes every route (health/holdings/activity/earnings/funding/
  faucet): params, request bodies, response shapes, error bodies. Served at `/openapi.json` + Swagger UI.
- **R-Q2** — A test fails if a registered app route is missing from the spec (or vice versa) — the spec
  can't silently drift.
- **R-Q3** — A committed Bruno collection covers each endpoint (env + example requests).
- **R-Q4** — Schemathesis runs green against the spec + a booted mock-mode server; evidence captured.
- **R-Q5** — A K6 script load-tests the read endpoints; a summary (p95, error rate) is captured.
- **R-INV** — No DB/Testcontainers/etc. invented. Secrets never in the spec, Bruno files, or evidence.
  Mock stays default; the vitest suite stays green.

## Key Technical Decisions

### KTD1 — Hand-authored OpenAPI beside the routes, conformance-tested (not a route rewrite)

Author the spec as a module (`backend/src/http/openapi.ts`) rather than rewriting the Fase B routes to
`@hono/zod-openapi` — the routes work and are tested; a rewrite is invasive risk for no product gain.
Keep the spec honest with a **conformance test** that asserts the set of paths in the spec equals the set
of routes the Hono app actually registers (read `app.routes`). Serve it via `@hono/swagger-ui` at `/docs`
+ a raw `/openapi.json`. If it ever drifts, the test fails.

### KTD2 — Schemathesis + K6 are ephemeral run tools, not deps

Schemathesis runs via `uvx schemathesis run` (no install, Python present); K6 via the `k6` binary
(`brew install k6` if absent). Neither is a package dependency or a CI gate — they are operator QA with
captured evidence, matching how the live smokes work. The scripts are committed so anyone can re-run.

## Implementation Units

**U1** is the foundation (OpenAPI). **U2 / U3 / U4** depend on U1's spec/served app and touch disjoint
paths (`bruno/`, `qa/schemathesis/`, `qa/k6/`) → parallel-safe after U1.

### U1. OpenAPI 3.1 spec + Swagger UI + conformance test

- **Goal:** A served, honest OpenAPI document for the Hono surface.
- **Requirements:** R-Q1, R-Q2, R-INV.
- **Dependencies:** none.
- **Files:** `backend/src/http/openapi.ts` (the spec + a `mountDocs(app)`), wire into `app.ts`/`server.ts`;
  `backend/src/http/openapi.integration.test.ts`; `backend/package.json` (+`@hono/swagger-ui`).
- **Approach:** Author an OpenAPI 3.1 object describing each route — query params (`depositor`, `actor`,
  `currency`, `limit`), the faucet request body (`{ address, currency }`), success response shapes
  (bigint-as-string), and the shaped error body (`{ error: { code, message } }`) with the status codes the
  routes actually return. `mountDocs(app)` adds `GET /openapi.json` + Swagger UI at `/docs`. Do **not**
  change existing route behavior.
- **Patterns to follow:** `backend/src/http/app.ts` (route list + shapes); `faucet.ts` (request/response).
- **Test scenarios (integration, object-real):**
  - Boot the app; `GET /openapi.json` → 200, valid OpenAPI 3.1 (openapi version, paths present).
  - **Conformance:** the spec's path set equals the app's registered route paths (derive from `app.routes`)
    — a route with no spec entry (or a spec path with no route) fails.
  - Each documented response code for a route matches one the route can actually return (e.g. faucet 400/
    409/429; earnings 200/5xx).
  - No secret field appears anywhere in the spec.
- **Verification:** spec served + valid + conformant; `pnpm -C backend test` green.

### U2. Bruno collection

- **Goal:** A committed Bruno collection covering every endpoint.
- **Requirements:** R-Q3, R-INV.
- **Dependencies:** U1 (mirror the spec).
- **Files:** `bruno/sorosense-api/` — `bruno.json`, an environment (`local.bru` with `baseUrl`), and one
  `.bru` per endpoint (health/holdings/activity/earnings/funding/faucet).
- **Approach:** Hand-author `.bru` files (Bruno's plain-text format) matching the routes: method, URL from
  `{{baseUrl}}`, query/body examples, and a couple of asserts (status, `content-type`). Faucet uses a
  placeholder address, **no secret**. A short README notes `bru run` (CLI) or opening the folder in Bruno.
- **Patterns to follow:** the OpenAPI spec (U1) for params/bodies.
- **Test scenarios:** `Test expectation: none — committed collection; validated by opening in Bruno / `bru run`.` Optionally, if the `@usebruno/cli` is available, run it against a booted mock server and record the result.
- **Verification:** the collection opens/parses; requests match the spec.

### U3. Schemathesis property/fuzz run

- **Goal:** Fuzz the API against its OpenAPI spec and confirm schema conformance.
- **Requirements:** R-Q4, R-INV.
- **Dependencies:** U1.
- **Files:** `qa/schemathesis/run.sh` (boot mock server → `uvx schemathesis run <base>/openapi.json …`);
  `docs/tests/api-qa/schemathesis-evidence.md`.
- **Approach:** Boot the backend in mock mode (no integration env → `MockVaultClient`, no network) on a
  test port, then `uvx schemathesis run http://localhost:<port>/openapi.json --checks all` (or the
  current flag set). Fix any real schema mismatch it surfaces (usually the spec, occasionally a route).
  GET routes are safe to fuzz; the faucet POST is exercised with the mock/absent minter → 404 (env-gated)
  or a validation path, so no mint fires. Capture the run summary as evidence.
- **Test scenarios:** `Test expectation: property/fuzz run — a green Schemathesis run is the evidence.`
- **Verification:** Schemathesis passes its checks against the served spec; summary recorded.

### U4. K6 load test

- **Goal:** Load-test the read endpoints and capture latency/error metrics.
- **Requirements:** R-Q5, R-INV.
- **Dependencies:** U1 (a booted server).
- **Files:** `qa/k6/read-endpoints.js` (k6 script: VUs/duration, hits health/holdings/activity/earnings/
  funding, thresholds on p95 + error rate); `qa/k6/README.md`; `docs/tests/api-qa/k6-evidence.md`.
- **Approach:** Boot the backend in mock mode, run `k6 run qa/k6/read-endpoints.js` (install k6 via brew if
  absent; if it cannot be installed, commit the script + document the command and mark the run pending).
  Modest load (e.g. 20–50 VUs, 30s), `http_req_duration p95` + `http_req_failed` thresholds. Capture the
  summary.
- **Test scenarios:** `Test expectation: load run — the k6 summary (p95, error rate) is the evidence.`
- **Verification:** k6 runs, thresholds reported; summary recorded (or the run marked pending if k6 can't
  install locally).

## Scope Boundaries

**In scope:** U1–U4 for the existing Hono read surface + faucet.

### Deferred to Follow-Up Work
- Wiring OpenAPI generation from zod (`@hono/zod-openapi`) if the routes are later refactored.
- CI automation of Schemathesis/K6 (no CI infra today) — they stay operator-run with committed scripts.
- **Frontend API proxy** (Next rewrites so the backend URL isn't exposed) — frontend track (coordinate
  with STE-52), not this backend unit.

**Out of scope (N/A for this architecture):** Postgres/Drizzle ORM, repository pattern, Testcontainers,
DTO + class-validator (we use zod), Inngest (agent uses Mastra), user/staff tables (wallet-auth, no
back-office). Adding these would build infrastructure the product neither has nor needs.

## Verification Contract

- **CI gate:** `pnpm -r typecheck && pnpm -r test` green with no integration env — the offline suite plus
  the new OpenAPI conformance test.
- **Schemathesis:** green run against the served spec (mock-mode server); summary in evidence.
- **K6:** a completed run with p95 + error-rate thresholds; summary in evidence (or pending if k6 absent).
- **Secret hygiene:** no secret in the spec, Bruno files, or evidence.

## Definition of Done

- OpenAPI 3.1 served + Swagger UI; a conformance test blocks spec drift.
- A committed Bruno collection covers every endpoint.
- Schemathesis passes against the spec; a K6 load summary is captured.
- Mock stays default; the vitest suite stays green; no DB/Testcontainers invented; no secret leaks.

## Risks & Dependencies

- **Spec drift** — mitigated by the conformance test (U1); Schemathesis also catches response mismatches.
- **k6 not installable locally** — commit the script + document; mark the run pending rather than fake a
  summary.
- **Schemathesis on POST /faucet** — env-gated off in mock mode (404), so fuzzing never mints; confirm the
  spec marks it accordingly.

## Open Questions (execution-time)

- **Faucet in the spec under mock mode:** document it as a route but note it's env-gated (present only when
  faucet env is set). Decide in U1 whether to include it always (with a 404 documented) or conditionally.
