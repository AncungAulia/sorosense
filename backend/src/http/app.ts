/**
 * Thin Hono HTTP surface (STE-21 Fase B, U1 / KTD1). Exposes the EXISTING composed backend reads
 * — `getHoldings` / `getActivity` / `getEarnings` / `getFundingOptions` — over GET routes and returns
 * their JSON verbatim. This layer is TRANSPORT ONLY: it re-implements no read logic.
 *
 * Invariants carried through unchanged:
 *  - Read-only — no route calls a vault write method (deposit/allocate/freeze/…). The vault is only
 *    ever handed to the read composers, which take a `Pick<VaultClient, …reads>`.
 *  - Safety is invisible — the reads carry no risk/label/score field; the route adds none.
 *  - `bigint` is serialized as a decimal string at the boundary via ONE shared replacer (mirroring the
 *    frontend `e2e/support/bridge.ts` bigint-as-string convention) — never hand-encoded per route.
 *  - A read that returns a typed `Result` error (e.g. an FX failure in earnings/holdings) surfaces as a
 *    non-200 with a shaped error body — never a silent 200 with $0.
 *
 * The app is exported listen-free so tests boot it with `app.request(...)` without opening a socket;
 * `server.ts` is the only place that binds a port.
 */

import { Hono } from 'hono';
import type { Context } from 'hono';
import { cors } from 'hono/cors';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

import type { Currency, VaultClient } from '@sorosense/vault-client';

import { type Err, type Result } from '../lib/result.js';
import { getActivity, type ActivityFeedDeps } from '../api/activity-feed.js';
import { getEarnings, type FxSource } from '../api/earnings.js';
import { getFundingOptions } from '../api/funding.js';
import { getHoldings } from '../api/holdings.js';
import { getPool } from '../api/pools.js';
import { getRates } from '../api/rates.js';
import { catalogApy, type ApySource } from '../api/venue-meta.js';
import type { VaultEvent } from '../earnings/cost-basis.js';
import type { SnapshotStore } from '../earnings/snapshotter.js';
import { mountDocs } from './openapi.js';

const CURRENCIES: readonly Currency[] = ['USD', 'EUR', 'MXN'];

/**
 * Everything the read composers need, injected so the app is deterministic and testable. Only the
 * vault's read methods are ever exercised — the type is the full client for convenience, but no route
 * reaches a write method.
 */
export interface HttpAppDeps {
  vault: VaultClient;
  /** FX per currency (display-only), shared by holdings + earnings. */
  fx: FxSource;
  /** APY per pool — live on-chain `rate_bps()` when set; the catalog figure when omitted (mock mode). */
  apy?: ApySource;
  /** Earnings history sources (real event reader deferred to integration). */
  earnings: {
    events: readonly VaultEvent[];
    snapshots: SnapshotStore;
  };
  /** Activity feed sources: the agent log + the user-action event stream. */
  activity: ActivityFeedDeps;
}

export interface HttpAppOptions {
  /** Allowed CORS origin(s) for the frontend. Defaults to the Next dev origin. */
  corsOrigin?: string | string[];
}

/** The single bigint→decimal-string boundary encoder (KTD1). Used for every JSON body. */
function bigintReplacer(_key: string, value: unknown): unknown {
  return typeof value === 'bigint' ? value.toString() : value;
}

/** Serialize a value as JSON with bigints rendered as decimal strings. */
function jsonBig(c: Context, data: unknown, status: ContentfulStatusCode = 200): Response {
  c.header('content-type', 'application/json; charset=utf-8');
  return c.body(JSON.stringify(data, bigintReplacer), status);
}

/** Map a typed `Result` error code to an HTTP status. */
function statusForErr(code: Err['code']): ContentfulStatusCode {
  switch (code) {
    case 'not_found':
      return 404;
    case 'timeout':
      return 504;
    case 'unavailable':
      return 503;
    case 'http':
    case 'parse':
      return 502;
    default:
      return 500;
  }
}

/** Emit a shaped error body (never a silent 200) for a failed read. */
function jsonErr(c: Context, err: Err): Response {
  return jsonBig(c, { error: { code: err.code, message: err.error } }, statusForErr(err.code));
}

/** A missing/invalid required query parameter. */
function badRequest(c: Context, message: string): Response {
  return jsonBig(c, { error: { code: 'bad_request', message } }, 400);
}

/** Parse the optional `?currency=` filter, rejecting anything outside the known buckets. */
function parseCurrency(raw: string | undefined): Currency | undefined | 'invalid' {
  if (raw === undefined) return undefined;
  return CURRENCIES.includes(raw as Currency) ? (raw as Currency) : 'invalid';
}

/**
 * Build the read-only HTTP app. Listen-free: `app.request(...)` drives it in tests; `server.ts` binds
 * the port. Every route wraps a composed read and returns its JSON verbatim.
 */
export function createApp(deps: HttpAppDeps, options: HttpAppOptions = {}): Hono {
  const app = new Hono();
  const apy = deps.apy ?? catalogApy;

  app.use('*', cors({ origin: options.corsOrigin ?? 'http://localhost:3000' }));

  app.get('/health', (c) => jsonBig(c, { status: 'ok' }));

  // GET /holdings?depositor=… — per-bucket holdings (Result: FX or APY failure → non-200).
  app.get('/holdings', async (c) => {
    const depositor = c.req.query('depositor');
    if (!depositor) return badRequest(c, 'missing required query parameter: depositor');
    const result: Result<unknown> = await getHoldings(depositor, { vault: deps.vault, fx: deps.fx, apy });
    if (!result.ok) return jsonErr(c, result);
    return jsonBig(c, result.value);
  });

  // GET /activity?depositor=&actor=&currency=&limit= — merged feed (no Result; plain shape).
  app.get('/activity', (c) => {
    const depositor = c.req.query('depositor');
    const actorRaw = c.req.query('actor');
    if (actorRaw !== undefined && actorRaw !== 'you' && actorRaw !== 'agent') {
      return badRequest(c, "invalid actor: expected 'you' or 'agent'");
    }
    const currency = parseCurrency(c.req.query('currency'));
    if (currency === 'invalid') return badRequest(c, 'invalid currency: expected USD, EUR, or MXN');
    const limitRaw = c.req.query('limit');
    let limit: number | undefined;
    if (limitRaw !== undefined) {
      const parsed = Number.parseInt(limitRaw, 10);
      if (!Number.isFinite(parsed) || parsed < 0) return badRequest(c, 'invalid limit');
      limit = parsed;
    }
    const feed = getActivity(
      { depositor, actor: actorRaw, currency, limit },
      deps.activity,
    );
    return jsonBig(c, feed);
  });

  // GET /earnings?depositor=… — blended-USD Earn view (Result: FX failure → non-200).
  app.get('/earnings', async (c) => {
    const depositor = c.req.query('depositor');
    if (!depositor) return badRequest(c, 'missing required query parameter: depositor');
    const result: Result<unknown> = await getEarnings(depositor, {
      vault: deps.vault,
      events: deps.earnings.events,
      snapshots: deps.earnings.snapshots,
      fx: deps.fx,
    });
    if (!result.ok) return jsonErr(c, result);
    return jsonBig(c, result.value);
  });

  // GET /funding — the Add-funds list (pure; no Result, no seam, no FX).
  app.get('/funding', (c) => jsonBig(c, getFundingOptions()));

  // GET /rates — the per-currency rate card for an UNFUNDED bucket, which `/holdings` omits by design
  // (R13). The APY is the live on-chain rate (or catalog offline); a failed read → shaped non-200.
  app.get('/rates', async (c) => {
    const result = await getRates(undefined, apy);
    if (!result.ok) return jsonErr(c, result);
    return jsonBig(c, result.value);
  });

  // GET /pools/:id — one vetted pool's name + rate (the exit-approval sheet's target). An unknown or
  // trap id is a shaped 404, never a 200 carrying `null`; a failed live rate read is a shaped non-200,
  // never a stale figure the user approves a move against.
  app.get('/pools/:id', async (c) => {
    const id = c.req.param('id');
    const result = await getPool(id, apy);
    if (!result.ok) return jsonErr(c, result);
    return jsonBig(c, result.value);
  });

  // OpenAPI spec (GET /openapi.json) + Swagger UI (GET /docs). Read-only, no secret.
  mountDocs(app);

  return app;
}
