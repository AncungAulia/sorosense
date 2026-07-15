# Activity Agent Temporal Scope + Bucket Row Copy

Date: 2026-07-15

## Symptom

After a fresh deposit, Home showed an Agent row such as "Put to work" with an old relative time
(`6h ago`). The bucket card also used the backend venue name (`SoroSense USD pool`) as the row title,
showed two tags, and repeated the net-APY performance-fee line in a compact card.

## Root Cause

`backend/src/api/activity-feed.ts` scoped account Agent rows by the depositor's currencies only. It did
not also require the agent row to happen after the depositor entered that bucket, so an older pool-level
allocation could be rendered as if it belonged to the user's new deposit.

On the frontend, `frontend/components/bucket/BucketRow.tsx` rendered `bucket.name` verbatim from
`/holdings`. In real mode that field is the active venue/pool name, not the product bucket label.

## Fix

Account-scoped Agent rows now require a matching currency and a `seq` at or after the user's first row
for that currency. Bucket rows now render the product label (`USD Bucket`, `EUR Bucket`), one venue chip,
and no compact net-fee line.

## Regression Coverage

- `backend/src/api/activity-feed.test.ts` covers hiding pre-deposit agent rows.
- `frontend/components/bucket/__tests__/BucketRow.test.tsx` covers the product label, single venue chip,
  and absence of fee copy in the compact row.
