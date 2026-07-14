/**
 * Thin listen entry for the U1 Hono read surface (KTD1). The app itself (`app.ts`) is listen-free so
 * tests boot it without a socket; this file is the ONLY place that binds a port.
 *
 * It wires the process-wide vault client (mock by default, real testnet when the integration env is
 * set — see `tools/vault.ts`), the display-only FX, and — in LIVE mode only — the realtime loops
 * (`realtime.ts`): an event poll that feeds `/earnings` and `/activity` from decoded on-chain events,
 * and a share-price snapshot loop that gives the chart a real time axis. Offline the deps holder stays
 * exactly as it was (empty history, stub FX) and not one socket is opened.
 */

import { serve } from '@hono/node-server';

import { makeReflectorFx, type FxSource } from '../api/earnings.js';
import { catalogApy } from '../api/venue-meta.js';
import { makeLiveApySource } from '../api/live-apy.js';
import { ActivityLog } from '../api/activity.js';
import { InMemorySnapshotStore } from '../earnings/snapshotter.js';
import { getVaultClient, isIntegrationEnv } from '../tools/vault.js';
import { ok } from '../lib/result.js';
import { createApp, type HttpAppDeps } from './app.js';
import { mountFaucet } from './faucet.js';
import { makeFaucetMinter } from './faucet-minter.js';
import { startRealtime } from './realtime.js';

const port = Number.parseInt(process.env.PORT ?? '8787', 10);

/** True when the integration env is set (real testnet) — the one gate, shared with `tools/vault.ts`. */
const live = isIntegrationEnv();

/** Deterministic offline FX for a mock/dev run — the mock server must not depend on the network.
 * Live runs use the real Reflector FX. Display-only fixed rates; never a fund conversion. */
const STUB_RATES: Record<string, number> = { USD: 1, EUR: 1.08, MXN: 0.058 };
const stubFx: FxSource = async (currency) => ok(STUB_RATES[currency] ?? 1);

/**
 * The deps HOLDER (KTD2). The routes dereference `earnings.events` / `activity.userEvents` at request
 * time, so the realtime poller refreshes them by REASSIGNING those two fields on this same object —
 * no app rebuild, no `app.ts` change. Offline they simply stay empty, as today.
 */
const deps: HttpAppDeps = {
  vault: getVaultClient(),
  fx: live ? makeReflectorFx() : stubFx,
  // Live: read each demo pool's real rate_bps() off-chain. Offline: the catalog figure (no RPC), so the
  // mock server answers /rates and /holdings without a network — byte-identical to today's offline shape.
  apy: live ? makeLiveApySource() : catalogApy,
  earnings: { events: [], snapshots: new InMemorySnapshotStore() },
  activity: { log: new ActivityLog(), userEvents: [], agentEvents: [] },
};

const app = createApp(deps, { corsOrigin: process.env.FRONTEND_ORIGIN });

// Live only: one immediate poll + one immediate snapshot (so the first request is already
// chain-sourced), then the two interval loops. Offline this is a no-op and returns null (R4).
const realtime = await startRealtime(deps);
if (realtime === null && live) {
  console.warn('Realtime loops are NOT running — /activity and /earnings will serve empty history');
}

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
