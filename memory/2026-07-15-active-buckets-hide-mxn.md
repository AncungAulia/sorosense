# Active Buckets Hide MXN

Date: 2026-07-15

## Symptom

Earn mobile could show `MXN bucket` in the funded bucket selector even though CETES/MXN is still a
coming-soon funding option.

## Root Cause

Some frontend bucket flows still treated every `Currency` (`USD`, `EUR`, `MXN`) as an active user
bucket. Simulator and funding already had explicit MXN handling, but Earn's funded selector and bucket
hooks did not share the same active-currency guard.

## Fix

Added `ACTIVE_BUCKET_CURRENCIES = ["USD", "EUR"]` and `isActiveBucketCurrency()` in
`frontend/lib/vault/data.ts`, then used it in `useBuckets`, `usePendingExit`, `useEarnings`, and the
Earn page selector. CETES can remain visible as coming soon in Add Funds, but MXN is filtered out of
active bucket views.

## Regression Coverage

- `frontend/app/(app)/earn/__tests__/earn-apy.test.tsx` checks the funded selector cycles All -> USD ->
  EUR -> All and never exposes MXN/CETES.
- `frontend/hooks/__tests__/useEarnings.api.test.tsx` checks backend MXN rows are dropped from active
  Earn buckets.
