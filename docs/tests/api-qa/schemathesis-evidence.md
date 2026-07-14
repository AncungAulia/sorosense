# API QA — Schemathesis (U3)

Property/fuzz test of the Hono read surface against its OpenAPI 3.1 spec, booted in **mock mode**
(offline stub FX, `MockVaultClient`, no network). Run: `bash qa/schemathesis/run.sh` (uses `uvx`, no install).

## Result (2026-07-13, schemathesis v4.22.4)

```
API Operations:  Selected 6/6 · Tested 6
Test Phases:     Coverage ✅ · Fuzzing ✅
Test cases:      204 generated, 204 passed
1 warning: POST /faucet repeatedly 404 (env-gated off in mock mode — expected & documented)
```

## What the fuzz run caught (and how it was resolved)

The first run surfaced **8 findings**; each was triaged:

1. **`/earnings` (and `/holdings`) returned 503 for valid input** — the mock server was hitting the
   **real Reflector FX** over the network (`fetch failed`). Fixed at the root: `server.ts` now uses a
   deterministic **offline stub FX** when the integration env is absent; the live path still uses
   Reflector. The mock/dev server is now fully offline.
2. **`/holdings` & `/earnings` rejected `depositor=` (empty string) with 400** — the spec allowed any
   string, so an empty one looked "valid." Fixed by `minLength: 1` on the `depositor` param; an empty
   value is now schema-invalid and the 400 is the correct rejection.
3. **Accepted as service behavior (excluded checks, documented in `run.sh`):**
   - `unsupported_method`: a wrong method on a known path returns 404 (not 405) — standard for this stack.
   - `negative_data_rejection`: unknown query params are ignored (200) — standard HTTP.

After (1)+(2), the run is green. `/faucet` 404 in mock mode is expected (env-gated).
