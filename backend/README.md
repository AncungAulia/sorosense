# SoroSense Backend
### The read API, Sentinel wiring, keeper runner, and faucet surface for SoroSense.

This package serves the frontend's backend reads, watches vault state, exposes OpenAPI docs, and
contains the server-side wiring for keeper-only actions.

---

## Folder structure

| Path | What's inside |
| --- | --- |
| `src/http/` | Hono app, server entry, OpenAPI, faucet, realtime polling |
| `src/api/` | Holdings, earnings, activity, funding, rates, pool metadata |
| `src/chain/` | Event reader, event store, poller |
| `src/earnings/` | Cost-basis and snapshot calculations |
| `src/keeper/` | Keeper runner and CLI logic |
| `src/mastra/` | Allocator workflow and model setup |
| `src/sentinel/` | Safety signals, scoring, freeze logic |
| `src/tools/` | Vault client, FX, catalog, pool rate, keeper signer |
| `src/scripts/` | Demo seed script |
| `.env.example` | Blank/placeholder env reference |

---

## Run locally

Mock mode needs no secrets and no network:

```bash
pnpm install
pnpm -C backend exec tsx src/http/server.ts
```

Default URL:

```text
http://localhost:8787
```

Health check:

```bash
curl http://localhost:8787/health
```

---

## API surface

| Route | Purpose |
| --- | --- |
| `GET /health` | Liveness |
| `GET /holdings?depositor=G...` | Funded bucket rows |
| `GET /activity?depositor=G...&actor=you|agent&currency=USD&limit=20` | Merged activity feed |
| `GET /earnings?depositor=G...` | Earn page view |
| `GET /funding` | Add-funds options |
| `GET /rates` | APY cards for unfunded buckets |
| `GET /pools/:id` | Exit-target pool metadata |
| `POST /faucet` | Testnet faucet mint, mounted only when configured |
| `GET /openapi.json` | OpenAPI 3.1 spec |
| `GET /docs` | Swagger UI |

Bigints are serialized as decimal strings at the HTTP boundary.

---

## Environment

Copy the template and fill values locally:

```bash
cp backend/.env.example backend/.env
```

Backend env may include real secrets. Do not commit real `KEEPER_SECRET`,
`FAUCET_ISSUER_SECRET`, or `DEMO_DEPOSITOR_SECRET`.

---

## Demo seed

With live testnet env configured:

```bash
pnpm -C backend demo:seed
```

The seed script creates or reuses a demo depositor, funds trustlines through the faucet path, deposits
into the vault, and prepares demo state.

---

## OpenAPI and Bruno

Run the server, then open:

- `http://localhost:8787/openapi.json`
- `http://localhost:8787/docs`

The Bruno collection lives at [`../bruno/sorosense-api`](../bruno/sorosense-api/README.md).

---

## Commands

```bash
pnpm -C backend typecheck
pnpm -C backend test
pnpm -C backend dev
pnpm -C backend exec tsx src/http/server.ts
pnpm -C backend demo:seed
```

---

## Notes

- The backend runs in mock mode when live env is incomplete.
- The faucet route is absent unless faucet env is complete.
- The frontend must point `NEXT_PUBLIC_API_URL` at this service when using backend reads.
- Secrets are backend-only and must never be converted into `NEXT_PUBLIC_*` values.
