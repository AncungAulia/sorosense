#!/usr/bin/env bash
# Schemathesis property/fuzz run against the Hono surface's OpenAPI spec (API QA, U3).
# Boots the backend in MOCK mode (no integration env → MockVaultClient + offline stub FX, no network).
#
# Two opinionated checks are excluded as accepted API behavior for this service:
#   - unsupported_method: Hono returns 404 (not 405) for a wrong method on a known path — standard, fine.
#   - negative_data_rejection: extra/unknown query params are ignored (200), not rejected — standard HTTP.
set -uo pipefail
cd "$(dirname "$0")/../.."
PORT="${PORT:-8787}"
unset VAULT_CONTRACT_ID STELLAR_RPC_URL STELLAR_NETWORK_PASSPHRASE KEEPER_SECRET FAUCET_ISSUER_SECRET
( cd backend && PORT="$PORT" npx --yes tsx src/http/server.ts ) &
SERVER_PID=$!
trap 'kill $SERVER_PID 2>/dev/null || true' EXIT
for i in $(seq 1 40); do curl -sf "http://localhost:$PORT/health" >/dev/null 2>&1 && break || sleep 0.5; done
curl -sf "http://localhost:$PORT/health" >/dev/null 2>&1 || { echo "server did not boot"; exit 1; }
uvx schemathesis run "http://localhost:$PORT/openapi.json" \
  --max-examples "${MAX_EXAMPLES:-15}" \
  --exclude-checks unsupported_method,negative_data_rejection
