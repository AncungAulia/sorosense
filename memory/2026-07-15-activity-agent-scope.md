# 2026-07-15 Activity Agent Scope

## Symptom
Home Agent card showed "Allocated EUR/USD into the yield pool" for a connected wallet that had not deposited.

## Root Cause
`GET /activity?depositor=...` filtered user rows by depositor, but agent rows were treated as global pool-level rows and always merged into account-scoped responses.

## Fix
`backend/src/api/activity-feed.ts` now scopes agent rows to the currencies present in the requested depositor's user activity. If the depositor has no scoped user currency activity, the account-scoped feed is empty. Global `GET /activity?actor=agent` still returns the global agent feed.

## Evidence
- Before: `/activity?depositor=<empty-wallet>` returned global agent allocate rows.
- After: `/activity?depositor=<empty-wallet>` returns `[]`.
- `pnpm -C backend test -- src/api/activity-feed.test.ts src/api/activity-feed.integration.test.ts src/http/http.integration.test.ts src/http/realtime.integration.test.ts`: 36 passed.
- `pnpm -C backend typecheck`: passed.

