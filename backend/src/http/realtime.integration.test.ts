/**
 * The realtime wiring end-to-end (U1 — R1, R2, R3, R4, R12). Object-real: the REAL `createApp`, the
 * REAL decoder, store and poller, the REAL `MockVaultClient` NAV math, driven by canned `ScVal` pages
 * through an injected `EventSource`. No network, no socket, no timer.
 *
 * The load-bearing test is `earned === 0`. Before this unit `server.ts` handed `/earnings` an EMPTY
 * event list, so `getEarnings` reconstructed contributions of `0` and reported a user's ENTIRE
 * PRINCIPAL as profit. Once the poller feeds the decoded `deposit` in, contributions are 1000 and
 * earned is 0 — which is also the honest figure, because the contract does not accrue yield yet
 * (`share_price` reads exactly `SHARE_PRICE_SCALE`).
 *
 * The other half is the offline guarantee (R4): with the integration env unset, `startRealtime`
 * constructs NOTHING — asserted by spy on the source factory, the ledger read and the scheduler, so the
 * proof does not depend on watching for a network call that must never happen.
 */

import { describe, expect, it, vi } from 'vitest';
import { Keypair, xdr } from '@stellar/stellar-sdk';
import { MockVaultClient, mockSigner, SHARE_PRICE_SCALE, type Currency } from '@sorosense/vault-client';

import { err, ok } from '../lib/result.js';
import { ActivityLog } from '../api/activity.js';
import { fxSymbolFor, makeReflectorFx, type FxSource } from '../api/earnings.js';
import { InMemorySnapshotStore } from '../earnings/snapshotter.js';
import type { EventPage, EventSource } from '../chain/event-reader.js';
import { depositEvt, scriptedSource } from '../chain/__fixtures__/vault-events.js';
import type { Scheduler } from '../scheduler/cron.js';
import { createApp, type HttpAppDeps } from './app.js';
import { startRealtime, type RealtimeOptions } from './realtime.js';

const UNIT = 10_000_000n; // 7-dp stroops scale
const ALICE = Keypair.random().publicKey();
const alice = mockSigner('depositor', ALICE);

/** The integration env, minus any real value — presence is all `isIntegrationEnv` checks. */
const LIVE_ENV: NodeJS.ProcessEnv = {
  VAULT_CONTRACT_ID: 'CTEST',
  STELLAR_RPC_URL: 'http://rpc.invalid',
  STELLAR_NETWORK_PASSPHRASE: 'Test SDF Network ; September 2015',
  KEEPER_SECRET: 'not-a-real-secret',
  VAULT_START_LEDGER: '100',
};

const stubFx: FxSource = async (c) => ok(({ USD: 1, EUR: 1.08, MXN: 0.058 } as Record<Currency, number>)[c]);

/** The two response shapes these tests read, mirroring `getEarnings` / `getActivity` at the boundary. */
interface EarningsBody {
  hasDeposit: boolean;
  balanceUsd: number;
  earnedUsd: number;
  chart: Array<{ ts: number; earnedUsd: number }>;
}
type FeedBody = Array<Record<string, unknown>>;

/** Decode a JSON body at the boundary (the app hands back `unknown`, as `http.integration` does). */
async function body<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

/** A fresh holder mirroring `server.ts`: empty history, reassigned by the poller (KTD2). */
async function buildDeps(): Promise<HttpAppDeps> {
  const vault = new MockVaultClient();
  // The real on-chain deposit the canned event mirrors: the vault holds 1000 USD of Alice's money.
  await vault.deposit(ALICE, 'USD', 1_000n * UNIT).signAndSubmit(alice);
  return {
    vault,
    fx: stubFx,
    earnings: { events: [], snapshots: new InMemorySnapshotStore() },
    activity: { log: new ActivityLog(), userEvents: [] },
  };
}

/** One page carrying Alice's `deposit(USD, 1000)`, then the empty page a quiet chain returns. */
function depositPages(ts = '2026-07-14T10:00:00Z'): EventPage[] {
  return [
    {
      events: [depositEvt('e1', 101, ALICE, 'Usd', 1_000n * UNIT, ts)],
      latestLedger: 120,
      cursor: 'c1',
    },
    { events: [], latestLedger: 120, cursor: 'c1' },
  ];
}

/** Start realtime in live mode with everything network-shaped injected. */
async function startLive(
  deps: HttpAppDeps,
  source: EventSource,
  overrides: RealtimeOptions = {},
): Promise<Awaited<ReturnType<typeof startRealtime>>> {
  return startRealtime(deps, {
    env: LIVE_ENV,
    createSource: () => source,
    schedule: (_ms, _handler) => ({ stop: () => {} }),
    clock: () => 1_752_490_000_000,
    log: () => {},
    ...overrides,
  });
}

describe('realtime wiring — live mode', () => {
  it('feeds /earnings from the polled deposit: earned is 0, NOT the whole principal', async () => {
    const deps = await buildDeps();
    const app = createApp(deps);

    // Before the poll the history source is empty — the very bug this unit kills.
    const before = await body<EarningsBody>(await app.request(`/earnings?depositor=${ALICE}`));
    expect(before.earnedUsd).toBeCloseTo(1000, 6); // principal reported as profit (the old lie)

    const handle = await startLive(deps, scriptedSource(depositPages()));
    expect(handle).not.toBeNull();

    const res = await app.request(`/earnings?depositor=${ALICE}`);
    const view = await body<EarningsBody>(res);

    expect(res.status).toBe(200);
    expect(view.balanceUsd).toBeCloseTo(1000, 6);
    // Cost basis reconstructed from the chain event: contributions 1000 ⇒ earned 0.
    expect(view.earnedUsd).toBeCloseTo(0, 6);
    expect(view.hasDeposit).toBe(true);
  });

  it('feeds /activity from the polled deposit (was an empty list)', async () => {
    const deps = await buildDeps();
    const app = createApp(deps);

    expect(await body<FeedBody>(await app.request(`/activity?depositor=${ALICE}`))).toEqual([]);

    await startLive(deps, scriptedSource(depositPages()));

    const rows = await body<FeedBody>(await app.request(`/activity?depositor=${ALICE}&actor=you`));

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ actor: 'you', kind: 'deposit', currency: 'USD', depositor: ALICE });
    expect(rows[0]?.detail).not.toMatch(/\b(risk|tier|score|label)\b/i);
  });

  it('a deposit that lands AFTER boot appears on the next poll — no restart (R2)', async () => {
    const deps = await buildDeps();
    const app = createApp(deps);
    // Boot sees nothing; the deposit closes later and only page 3 carries it.
    const source = scriptedSource([
      { events: [], latestLedger: 120, cursor: 'c0' },
      { events: [depositEvt('e1', 130, ALICE, 'Usd', 1_000n * UNIT)], latestLedger: 140, cursor: 'c1' },
      { events: [], latestLedger: 140, cursor: 'c1' },
    ]);

    const handle = await startLive(deps, source);
    expect(await body<FeedBody>(await app.request(`/activity?depositor=${ALICE}`))).toEqual([]);

    await handle?.poll(); // one interval later

    const rows = await body<FeedBody>(await app.request(`/activity?depositor=${ALICE}`));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: 'deposit' });
  });

  it('snapshot ticks populate the share-price series, so /earnings has chart points (R3)', async () => {
    const deps = await buildDeps();
    const app = createApp(deps);
    let now = 1_752_490_000_000;

    const handle = await startLive(deps, scriptedSource(depositPages()), { clock: () => now });
    now += 60_000;
    await handle?.snapshot(); // the second tick, one interval later

    const view = await body<EarningsBody>(await app.request(`/earnings?depositor=${ALICE}`));

    // The two snapshot ticks (boot + one interval later) are sampled on the chart. The chart may also
    // carry the deposit's own timestamp — U1b samples union(snapshot ts, event ts) so a deposit steps
    // the value chart before the next tick — so assert the snapshot times are present, not that they
    // are the only two.
    expect(view.chart.map((p) => p.ts)).toEqual(
      expect.arrayContaining([1_752_490_000_000, 1_752_490_060_000]),
    );
    // Honest by construction: the contract does not accrue, so every point is flat at zero (R10).
    for (const point of view.chart) expect(point.earnedUsd).toBeCloseTo(0, 6);
    expect(deps.earnings.snapshots.series('USD').at(-1)?.price).toBe(SHARE_PRICE_SCALE);
  });

  it('resolves the start ledger from the current ledger minus the retention margin, clamped to >= 1', async () => {
    const deps = await buildDeps();
    const { VAULT_START_LEDGER: _unset, ...envWithoutStart } = LIVE_ENV;

    // A young chain: latest 1000 − 120 000 would be negative, so the clamp must floor it at 1 (KTD1).
    const young = await startLive(deps, scriptedSource([]), {
      env: envWithoutStart,
      readLatestLedger: async () => 1_000,
    });
    expect(young?.startLedger).toBe(1);

    // A mature chain: start inside the ~7-day retention window, never at the deploy ledger.
    const mature = await startLive(await buildDeps(), scriptedSource([]), {
      env: envWithoutStart,
      readLatestLedger: async () => 500_000,
    });
    expect(mature?.startLedger).toBe(380_000);
  });

  it('honors VAULT_START_LEDGER and does not read the chain for it', async () => {
    const readLatestLedger = vi.fn(async () => 999_999);
    const handle = await startLive(await buildDeps(), scriptedSource([]), { readLatestLedger });

    expect(handle?.startLedger).toBe(100);
    expect(readLatestLedger).not.toHaveBeenCalled();
  });

  it('schedules both loops on the configured intervals, defaulting to 10s / 60s', async () => {
    const intervals: number[] = [];
    const schedule = (ms: number): Scheduler => {
      intervals.push(ms);
      return { stop: () => {} };
    };

    await startLive(await buildDeps(), scriptedSource([]), { schedule });
    expect(intervals).toEqual([10_000, 60_000]);

    intervals.length = 0;
    await startLive(await buildDeps(), scriptedSource([]), {
      schedule,
      env: { ...LIVE_ENV, EVENT_POLL_MS: '2500', SNAPSHOT_INTERVAL_MS: '30000' },
    });
    expect(intervals).toEqual([2_500, 30_000]);
  });

  it('is fail-soft at boot: an RPC that throws leaves the routes serving, not crashing', async () => {
    const deps = await buildDeps();
    const app = createApp(deps);
    const dead: EventSource = {
      async getEvents(): Promise<EventPage> {
        throw new Error('rpc unavailable');
      },
    };
    const onError = vi.fn();

    const handle = await startLive(deps, dead, { onError });

    expect(handle).not.toBeNull(); // the loops stay scheduled; the next tick retries
    expect(onError).toHaveBeenCalled();
    expect((await app.request(`/activity?depositor=${ALICE}`)).status).toBe(200);
  });
});

describe('realtime wiring — offline mode (R4)', () => {
  it('constructs no source, no ledger read and no scheduler when the integration env is unset', async () => {
    const deps = await buildDeps();
    const createSource = vi.fn();
    const readLatestLedger = vi.fn();
    const schedule = vi.fn();

    const handle = await startRealtime(deps, {
      env: {}, // no VAULT_CONTRACT_ID / STELLAR_RPC_URL / passphrase / KEEPER_SECRET
      createSource: createSource as never,
      readLatestLedger: readLatestLedger as never,
      schedule: schedule as never,
    });

    expect(handle).toBeNull();
    expect(createSource).not.toHaveBeenCalled(); // ⇒ no `rpc.Server` is ever instantiated
    expect(readLatestLedger).not.toHaveBeenCalled();
    expect(schedule).not.toHaveBeenCalled();
    // The history sources stay exactly as today: empty, no chain, no network.
    expect(deps.earnings.events).toEqual([]);
    expect(deps.activity.userEvents).toEqual([]);
  });

  it('stays offline when only SOME integration vars are set (a half-configured .env is not live)', async () => {
    const createSource = vi.fn();
    const handle = await startRealtime(await buildDeps(), {
      env: { VAULT_CONTRACT_ID: 'CTEST', STELLAR_RPC_URL: 'http://rpc.invalid' }, // no passphrase/secret
      createSource: createSource as never,
    });

    expect(handle).toBeNull();
    expect(createSource).not.toHaveBeenCalled();
  });
});

/** The network env a live backend runs with — never reached here: a stub `OracleSource` intercepts. */
const LIVE_FX_ENV = {
  STELLAR_RPC_URL: 'https://rpc.invalid',
  STELLAR_NETWORK_PASSPHRASE: 'Test SDF Network ; September 2015',
} as NodeJS.ProcessEnv;

describe('Reflector FX symbols are config, not code (KTD6, R12)', () => {
  it('defaults to what the oracle actually lists (EURC; no MXN) and lets env override them', () => {
    expect(fxSymbolFor('USD', {})).toBeNull(); // the numéraire IS the oracle's base — no symbol, no read
    expect(fxSymbolFor('EUR', {})).toBe('EURC'); // the feed prices the euro stablecoin, not an EURUSD pair
    expect(fxSymbolFor('MXN', {})).toBeNull(); // the feed carries no MXN at all (verified via `assets()`)

    expect(fxSymbolFor('EUR', { FX_SYMBOL_EUR: 'EURUSDT' })).toBe('EURUSDT');
    expect(fxSymbolFor('MXN', { FX_SYMBOL_MXN: 'MXN_USD' })).toBe('MXN_USD');
  });

  it('an unpriceable bucket fails closed — never a 1:1 rate that would invent money', async () => {
    const fx = makeReflectorFx(() => null, { env: {} as NodeJS.ProcessEnv });

    expect(await fx('USD')).toEqual(ok(1)); // the base: rate 1 by definition, no oracle read
    const mxn = await fx('MXN');
    expect(mxn.ok).toBe(false);
    if (mxn.ok) return;
    expect(mxn.code).toBe('unavailable');
  });

  it('a symbol the feed does not carry is an unavailable RATE (503), not a 404 "no such depositor"', async () => {
    // `getReflectorPrice` types Option::None as `not_found` — precise for the tool, but HTTP-mapped to
    // 404. As an FX rate it means "unavailable", which is the 503 the read surfaces already promise.
    const source = { simulate: async () => xdr.ScVal.scvVoid() }; // the oracle's Option::None
    const fx = makeReflectorFx(() => 'NOPE', { source, env: LIVE_FX_ENV });

    const rate = await fx('EUR');

    expect(rate.ok).toBe(false);
    if (rate.ok) return;
    expect(rate.code).toBe('unavailable');
  });

  it('an FX failure still surfaces as a non-200 from /earnings — never a 200 with $0', async () => {
    const deps = await buildDeps();
    const app = createApp({ ...deps, fx: async () => err('unavailable', 'reflector down') });

    const res = await app.request(`/earnings?depositor=${ALICE}`);

    expect(res.status).toBe(503);
    const failed = await body<{ error?: { code: string }; earnedUsd?: number }>(res);
    expect(failed.error).toMatchObject({ code: 'unavailable' });
    expect(failed.earnedUsd).toBeUndefined(); // never a silent $0
  });
});
