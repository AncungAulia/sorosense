/**
 * OpenAPI conformance (API QA, U1) — the spec is served and cannot silently drift from the routes.
 * Boots the real Hono app and asserts: (1) `/openapi.json` serves a valid OpenAPI 3.1 doc; (2) every
 * registered API route is documented (no undocumented endpoint); (3) every documented path except the
 * env-gated `/faucet` is a real route (no phantom doc). Object-real, no network.
 */

import { describe, expect, it } from 'vitest';
import { MockVaultClient } from '@sorosense/vault-client';
import { ok, type Result } from '../lib/result.js';
import { ActivityLog } from '../api/activity.js';
import { InMemorySnapshotStore } from '../earnings/snapshotter.js';
import type { FxSource } from '../api/earnings.js';
import { createApp } from './app.js';
import { openApiSpec } from './openapi.js';

const fx: FxSource = async (): Promise<Result<number>> => ok(1);

function boot() {
  return createApp({
    vault: new MockVaultClient(),
    fx,
    earnings: { events: [], snapshots: new InMemorySnapshotStore() },
    activity: { log: new ActivityLog(), userEvents: [] },
  });
}

/** Meta / middleware routes that are not part of the documented API surface. */
const META = new Set(['/openapi.json', '/docs', '*', '/*']);

/**
 * Hono declares a path parameter as `:id`, OpenAPI as `{id}`. Normalize the route to the spec's form so
 * a parameterized route (`/pools/:id`) is still checked for drift instead of silently exempted — an
 * un-normalized comparison would report every documented `/pools/{id}` as a phantom.
 */
const toSpecPath = (route: string): string => route.replace(/:([^/]+)/g, '{$1}');

describe('OpenAPI conformance', () => {
  it('serves a valid OpenAPI 3.1 document at /openapi.json', async () => {
    const res = await boot().request('/openapi.json');
    expect(res.status).toBe(200);
    const spec = (await res.json()) as { openapi: string; paths: Record<string, unknown> };
    expect(spec.openapi).toBe('3.1.0');
    expect(typeof spec.paths).toBe('object');
    expect(Object.keys(spec.paths).length).toBeGreaterThan(0);
  });

  it('documents every registered API route (no undocumented endpoint)', () => {
    const app = boot();
    const registered = new Set(
      app.routes.map((r) => r.path).filter((p) => !META.has(p)).map(toSpecPath),
    );
    const documented = new Set(Object.keys(openApiSpec.paths));
    for (const path of registered) {
      expect(documented.has(path), `route ${path} is not in the OpenAPI spec`).toBe(true);
    }
  });

  it('has no phantom documented path except the env-gated /faucet', () => {
    const app = boot();
    const registered = new Set(app.routes.map((r) => toSpecPath(r.path)));
    for (const path of Object.keys(openApiSpec.paths)) {
      if (path === '/faucet') continue; // env-gated: mounted only when faucet env is set
      expect(registered.has(path), `spec path ${path} has no route`).toBe(true);
    }
  });

  it('documents the /earnings timeline fields the frontend charts read (U1b)', () => {
    const earnings = openApiSpec.paths['/earnings'].get.responses['200'].content['application/json'].schema;

    // The chart carries value AND earned per point; the buckets carry their own earned.
    expect(Object.keys(earnings.properties.chart.items.properties)).toEqual(['ts', 'valueUsd', 'earnedUsd']);
    expect(Object.keys(earnings.properties.buckets.items.properties)).toEqual([
      'currency',
      'nativeValue',
      'usdValue',
      'earnedUsd',
    ]);
  });

  it('leaks no secret in the spec', () => {
    expect(JSON.stringify(openApiSpec)).not.toMatch(/secret|seed|S[A-Z2-7]{55}/i);
  });
});
