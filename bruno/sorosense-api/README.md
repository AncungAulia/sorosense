# SoroSense API — Bruno collection

We use **Bruno** (not Postman). Open this folder in Bruno, or run headless:

```
npm i -g @usebruno/cli
cd bruno/sorosense-api && bru run --env local
```

Point `baseUrl` (env `local`) at a running backend (`pnpm -C backend exec tsx src/http/server.ts`,
default port 8787). Mirrors `backend/src/http/openapi.ts`. `/faucet` is env-gated (404 unless the
faucet env is set); never carries a secret.
