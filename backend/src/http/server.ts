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

import { makeReflectorFx } from '../api/earnings.js';
import { ActivityLog } from '../api/activity.js';
import { InMemorySnapshotStore } from '../earnings/snapshotter.js';
import { getVaultClient } from '../tools/vault.js';
import { createApp } from './app.js';

const port = Number.parseInt(process.env.PORT ?? '8787', 10);

const app = createApp(
  {
    vault: getVaultClient(),
    fx: makeReflectorFx(),
    earnings: { events: [], snapshots: new InMemorySnapshotStore() },
    activity: { log: new ActivityLog(), userEvents: [] },
  },
  { corsOrigin: process.env.FRONTEND_ORIGIN },
);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`SoroSense read surface listening on http://localhost:${info.port}`);
});
