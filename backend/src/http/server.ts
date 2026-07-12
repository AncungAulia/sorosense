/**
 * Thin listen entry for the U1 Hono read surface (KTD1). The app itself (`app.ts`) is listen-free so
 * tests boot it without a socket; this file is the ONLY place that binds a port.
 *
 * It wires the process-wide vault client (mock by default, real testnet when the integration env is
 * set — see `tools/vault.ts`) and the display-only Reflector FX into the app. The on-chain event
 * readers for earnings/activity are deferred to integration (Fase C), so those history sources start
 * empty here; the composed reads still serve their shapes.
 */

import { serve } from '@hono/node-server';

import { makeReflectorFx, type FxSource } from '../api/earnings.js';
import { ActivityLog } from '../api/activity.js';
import { InMemorySnapshotStore } from '../earnings/snapshotter.js';
import { getVaultClient } from '../tools/vault.js';
import { ok } from '../lib/result.js';
import { createApp } from './app.js';
import { mountFaucet } from './faucet.js';
import { makeFaucetMinter } from './faucet-minter.js';

const port = Number.parseInt(process.env.PORT ?? '8787', 10);

/** True when the integration env is set (real testnet). Mirrors the selection in `tools/vault.ts`. */
const live = Boolean(
  process.env.VAULT_CONTRACT_ID &&
    process.env.STELLAR_RPC_URL &&
    process.env.STELLAR_NETWORK_PASSPHRASE &&
    process.env.KEEPER_SECRET,
);

/** Deterministic offline FX for a mock/dev run — the mock server must not depend on the network.
 * Live runs use the real Reflector FX. Display-only fixed rates; never a fund conversion. */
const STUB_RATES: Record<string, number> = { USD: 1, EUR: 1.08, MXN: 0.058 };
const stubFx: FxSource = async (currency) => ok(STUB_RATES[currency] ?? 1);

const app = createApp(
  {
    vault: getVaultClient(),
    fx: live ? makeReflectorFx() : stubFx,
    earnings: { events: [], snapshots: new InMemorySnapshotStore() },
    activity: { log: new ActivityLog(), userEvents: [] },
  },
  { corsOrigin: process.env.FRONTEND_ORIGIN },
);

// Faucet is env-gated: mounted only when the issuer secret + SAC ids + network are all present, so the
// route simply does not exist on mainnet or in a mock-only run. `FAUCET_ISSUER_SECRET` stays backend-only.
const { FAUCET_ISSUER_SECRET, USDC_SAC, EURC_SAC, STELLAR_RPC_URL, STELLAR_NETWORK_PASSPHRASE } =
  process.env;
if (FAUCET_ISSUER_SECRET && USDC_SAC && EURC_SAC && STELLAR_RPC_URL && STELLAR_NETWORK_PASSPHRASE) {
  mountFaucet(app, {
    sac: { USD: USDC_SAC, EUR: EURC_SAC },
    minter: makeFaucetMinter({
      issuerSecret: FAUCET_ISSUER_SECRET,
      rpcUrl: STELLAR_RPC_URL,
      networkPassphrase: STELLAR_NETWORK_PASSPHRASE,
    }),
  });
  console.log('Faucet route mounted (POST /faucet)');
}

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`SoroSense read surface listening on http://localhost:${info.port}`);
});
