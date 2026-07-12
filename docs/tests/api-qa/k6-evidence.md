# API QA — K6 load test (U4)

Load test of the Hono read surface, booted in mock mode (offline stub FX, `MockVaultClient`).
Script: `qa/k6/read-endpoints.js`. Run: boot `src/http/server.ts` (mock), then `k6 run qa/k6/read-endpoints.js`.

## Result (2026-07-13, k6 v2.1.0)

30 VUs · 20s · 5 read endpoints per iteration (`/health`, `/holdings`, `/activity`, `/earnings`, `/funding`):

```
~5,700 iterations (0 interrupted) → ~28,500 requests

█ THRESHOLDS
  http_req_duration   ✓ 'p(95)<500'   p(95) = 2.88 ms
  http_req_failed     ✓ 'rate<0.01'   rate  = 0.00 %
```

Both thresholds pass: p95 latency ~3ms, zero errors. The read surface is a thin transport over in-memory
mock reads, so this measures the HTTP layer's overhead — comfortably within budget.
