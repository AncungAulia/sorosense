/**
 * E2E integration — the U1 Hono read surface wired against the REAL MockVaultClient (NAV share math)
 * and the real read composers, driven through `app.request(...)` with NO network socket. Proves the
 * whole chain end-to-end:
 *  - GET /holdings|/activity|/earnings|/funding serve the underlying read's shape verbatim;
 *  - `bigint` fields cross the boundary as decimal strings (KTD1);
 *  - no risk/label/score/tier field appears anywhere (safety is invisible);
 *  - a typed `Result` error (a forced FX failure for earnings) surfaces as a non-200 shaped error body,
 *    never a silent 200;
 *  - the routes are read-only — no vault write method is invoked while serving a read.
 */

import { describe, expect, it, vi } from 'vitest';
import { MockVaultClient, mockSigner, type Currency } from '@sorosense/vault-client';

import { err, ok } from '../lib/result.js';
import type { FxSource } from '../api/earnings.js';
import { ActivityLog } from '../api/activity.js';
import type { UserActionEvent } from '../api/user-activity.js';
import type { VaultEvent } from '../earnings/cost-basis.js';
import { InMemorySnapshotStore } from '../earnings/snapshotter.js';
import { createApp, type HttpAppDeps } from './app.js';

const UNIT = 10_000_000n; // 7-dp stroops scale
const alice = mockSigner('depositor', 'alice');
const keeper = mockSigner('keeper', 'sentinel');

const okFx = (map: Partial<Record<Currency, number>> = {}): FxSource => async (c) => ok(map[c] ?? 1);
const failingFx = (): FxSource => async () => err('unavailable', 'reflector down');

/** Funded state mirroring the frontend seed: USD in DeFindex (healthy), EUR in Blend (frozen). */
async function seedFunded(vault: MockVaultClient): Promise<void> {
  await vault.deposit('alice', 'USD', 1000n * UNIT).signAndSubmit(alice);
  await vault.deposit('alice', 'EUR', 900n * UNIT).signAndSubmit(alice);
  await vault.allocate('defindex-usdc', 'USD', 1000n * UNIT).signAndSubmit(keeper);
  await vault.allocate('blend-eurc', 'EUR', 900n * UNIT).signAndSubmit(keeper);
  vault.simulateYield('USD', 100n * UNIT);
  vault.simulateYield('EUR', 80n * UNIT);
  await vault.freeze('blend-eurc').signAndSubmit(keeper);
}

/** The user's own actions + a couple agent rows, so the feed has both actors. */
function seedActivity(): { log: ActivityLog; userEvents: UserActionEvent[] } {
  const log = new ActivityLog();
  log.append({ currency: 'USD', kind: 'allocated', detail: 'USD -> DeFindex USDC' });
  log.append({ currency: 'EUR', kind: 'froze', detail: 'Blend EURC paused' });
  const userEvents: UserActionEvent[] = [
    { kind: 'deposit', depositor: 'alice', currency: 'USD', amount: 1000n * UNIT, seq: 1 },
    { kind: 'sign-mandate', depositor: 'alice', seq: 2 },
  ];
  return { log, userEvents };
}

/** Deposit events so earnings has a cost basis matching the seeded vault. */
const earningsEvents: readonly VaultEvent[] = [
  { kind: 'deposit', depositor: 'alice', currency: 'USD', amount: 1000n * UNIT, shares: 1000n * UNIT, seq: 1 },
  { kind: 'deposit', depositor: 'alice', currency: 'EUR', amount: 900n * UNIT, shares: 900n * UNIT, seq: 2 },
];

async function buildDeps(vault: MockVaultClient, fx: FxSource): Promise<HttpAppDeps> {
  return {
    vault,
    fx,
    earnings: { events: earningsEvents, snapshots: new InMemorySnapshotStore() },
    activity: seedActivity(),
  };
}

/** Recursively assert no forbidden safety key appears anywhere in a JSON value. */
function assertNoForbiddenKey(value: unknown): void {
  const forbidden = new Set(['risk', 'label', 'score', 'tier']);
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) {
      for (const item of v) walk(item);
    } else if (v && typeof v === 'object') {
      for (const [k, val] of Object.entries(v)) {
        expect(forbidden.has(k), `forbidden key "${k}" leaked`).toBe(false);
        walk(val);
      }
    }
  };
  walk(value);
}

describe('U1 Hono read surface — e2e against the mock vault', () => {
  it('GET /health → 200 ok', async () => {
    const vault = new MockVaultClient();
    const app = createApp(await buildDeps(vault, okFx()));
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });

  it('GET /holdings → 200, bigint fields as decimal strings, no risk/label/score', async () => {
    const vault = new MockVaultClient();
    await seedFunded(vault);
    const app = createApp(await buildDeps(vault, okFx({ EUR: 1.1 })));

    const res = await app.request('/holdings?depositor=alice');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');

    const body = (await res.json()) as Array<Record<string, unknown>>;
    expect(body.map((h) => h.currency)).toEqual(['USD', 'EUR']);

    const usd = body.find((h) => h.currency === 'USD')!;
    // bigint fields crossed the boundary as decimal strings, not numbers/objects.
    expect(typeof usd.shares).toBe('string');
    expect(typeof usd.value).toBe('string');
    expect(usd.shares).toMatch(/^\d+$/);
    expect(usd.value).toMatch(/^\d+$/);
    // display-only USD stays a JSON number.
    expect(typeof usd.valueUsd).toBe('number');
    expect(usd.venue).toBe('DeFindex');

    assertNoForbiddenKey(body);
  });

  it('GET /holdings without depositor → 400', async () => {
    const vault = new MockVaultClient();
    const app = createApp(await buildDeps(vault, okFx()));
    const res = await app.request('/holdings');
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('bad_request');
  });

  it('GET /activity → the merged feed shape (both actors)', async () => {
    const vault = new MockVaultClient();
    const app = createApp(await buildDeps(vault, okFx()));
    const res = await app.request('/activity?depositor=alice');
    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<Record<string, unknown>>;
    expect(body.length).toBeGreaterThan(0);
    expect(body.some((r) => r.actor === 'agent')).toBe(true);
    expect(body.some((r) => r.actor === 'you')).toBe(true);
    assertNoForbiddenKey(body);

    // The actor filter is threaded through to the read.
    const yours = await app.request('/activity?depositor=alice&actor=you');
    const yoursBody = (await yours.json()) as Array<Record<string, unknown>>;
    expect(yoursBody.every((r) => r.actor === 'you')).toBe(true);
  });

  it('GET /earnings → the blended-USD view, nativeValue bigints as strings', async () => {
    const vault = new MockVaultClient();
    await seedFunded(vault);
    const app = createApp(await buildDeps(vault, okFx({ EUR: 1.1 })));
    const res = await app.request('/earnings?depositor=alice');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      hasDeposit: boolean;
      balanceUsd: number;
      buckets: Array<{ currency: string; nativeValue: unknown }>;
    };
    expect(body.hasDeposit).toBe(true);
    expect(typeof body.balanceUsd).toBe('number');
    for (const b of body.buckets) expect(typeof b.nativeValue).toBe('string');
    assertNoForbiddenKey(body);
  });

  it('GET /funding → stablecoins + apy-less RWA', async () => {
    const vault = new MockVaultClient();
    const app = createApp(await buildDeps(vault, okFx()));
    const res = await app.request('/funding');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      stablecoins: Array<{ sym: string }>;
      rwa: Array<Record<string, unknown>>;
    };
    expect(body.stablecoins.map((s) => s.sym).sort()).toEqual(['CETES', 'EURC', 'USDC']);
    for (const r of body.rwa) expect('apy' in r).toBe(false);
    assertNoForbiddenKey(body);
  });

  it('a typed FX failure for earnings → non-200 shaped error, not a silent 200', async () => {
    const vault = new MockVaultClient();
    await seedFunded(vault);
    const app = createApp(await buildDeps(vault, failingFx()));
    const res = await app.request('/earnings?depositor=alice');
    expect(res.status).toBe(503); // 'unavailable' → 503
    expect(res.status).not.toBe(200);
    const body = (await res.json()) as { error?: { code: string; message: string } };
    expect(body.error?.code).toBe('unavailable');
    expect(body.error?.message).toContain('reflector');
    // The failure body carries NO earnings payload (never a silent $0 view).
    expect('balanceUsd' in body).toBe(false);
  });

  it('serving every read invokes NO vault write method (read-only)', async () => {
    const vault = new MockVaultClient();
    await seedFunded(vault); // seeding uses writes — spy AFTER it.

    const writeMethods = [
      'deposit',
      'withdraw',
      'setPolicyConsent',
      'setAutoCompound',
      'allocate',
      'deallocate',
      'freeze',
      'proposeExit',
    ] as const;
    const spies = writeMethods.map((m) => vi.spyOn(vault, m));

    const app = createApp(await buildDeps(vault, okFx({ EUR: 1.1 })));
    await app.request('/holdings?depositor=alice');
    await app.request('/activity?depositor=alice');
    await app.request('/earnings?depositor=alice');
    await app.request('/funding');
    await app.request('/health');

    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });
});
