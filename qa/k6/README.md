# K6 load test — SoroSense read surface

```
# 1. boot the backend in mock mode (offline, no integration env)
pnpm -C backend exec tsx src/http/server.ts
# 2. load test
k6 run qa/k6/read-endpoints.js            # or: k6 run -e BASE=http://host:port qa/k6/read-endpoints.js
```

30 VUs / 20s over the read endpoints. Thresholds: `http_req_duration p95 < 500ms`, `http_req_failed < 1%`.
Install k6: `brew install k6` (macOS) / see grafana.com/docs/k6.
