/**
 * pool-rate reader — offline tests over the REAL decode path (U4, KTD7). A canned `rate_bps` ScVal is
 * fed through the same code a live read runs, so these prove the decode without a network, mirroring
 * `price.test.ts`. The reader must fail closed on every bad input — a 0% APY is a false headline, not a
 * degraded read.
 */

import { describe, expect, it, vi } from 'vitest';
import { nativeToScVal, xdr } from '@stellar/stellar-sdk';

import {
  getPoolApy,
  makePoolRateReader,
  poolSourceConfigFrom,
  type PoolSource,
} from './pool-rate.js';

const POOL = 'CBQHNAXSI55GX2GN6D67GK7BHVPSLJUGZQEU7WJ5LKR5PNUCGLIMAO4K';

const LIVE_ENV: NodeJS.ProcessEnv = {
  STELLAR_RPC_URL: 'https://soroban-testnet.stellar.org',
  STELLAR_NETWORK_PASSPHRASE: 'Test SDF Network ; September 2015',
};

/** A source that returns a fixed ScVal for `rate_bps`. */
const sourceReturning = (val: xdr.ScVal | undefined): PoolSource => ({
  simulate: vi.fn(async () => val),
});

describe('getPoolApy — reads a yield pool rate_bps off-chain', () => {
  it('decodes a rate_bps of 1000 to an APY of 10.00%', async () => {
    const source = sourceReturning(nativeToScVal(1000, { type: 'u32' }));
    const r = await getPoolApy(POOL, { source, env: LIVE_ENV });
    expect(r).toEqual({ ok: true, value: 10 });
  });

  it('decodes a non-round rate: 1234 bps → 12.34%', async () => {
    const source = sourceReturning(nativeToScVal(1234, { type: 'u32' }));
    const r = await getPoolApy(POOL, { source, env: LIVE_ENV });
    expect(r.ok && r.value).toBe(12.34);
  });

  it('calls rate_bps with no arguments', async () => {
    const source = sourceReturning(nativeToScVal(1000, { type: 'u32' }));
    await getPoolApy(POOL, { source, env: LIVE_ENV });
    expect(source.simulate).toHaveBeenCalledWith('rate_bps', []);
  });

  it('rejects a zero rate — a 0% APY is a lie, not a degraded read', async () => {
    const source = sourceReturning(nativeToScVal(0, { type: 'u32' }));
    const r = await getPoolApy(POOL, { source, env: LIVE_ENV });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('parse');
  });

  it('an empty simulation result is unavailable, not a rate', async () => {
    const r = await getPoolApy(POOL, { source: sourceReturning(undefined), env: LIVE_ENV });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('unavailable');
  });

  it('turns an RPC/simulation failure into a typed error, never a throw', async () => {
    const failing: PoolSource = {
      simulate: async () => {
        throw new Error('rpc exploded');
      },
    };
    const r = await getPoolApy(POOL, { source: failing, env: LIVE_ENV });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('unavailable');
  });

  it('with no network env configured it fails closed WITHOUT constructing an RPC client', async () => {
    // No source injected and no env → construction path; must not throw, must be unavailable.
    const r = await getPoolApy(POOL, { env: {} });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('unavailable');
  });

  it('a typo in the pool id is a typed error, not a thrown 500', async () => {
    const r = await getPoolApy('not-a-strkey', { env: LIVE_ENV });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('unavailable');
  });
});

describe('makePoolRateReader — one transport per pool', () => {
  it('reuses the injected source across calls (no per-read reconstruction)', async () => {
    const source = sourceReturning(nativeToScVal(1000, { type: 'u32' }));
    const read = makePoolRateReader(POOL, { source, env: LIVE_ENV });
    await read();
    await read();
    expect(source.simulate).toHaveBeenCalledTimes(2);
  });
});

describe('pool source config is env-driven (a wrong id/url is an .env edit, not a patch)', () => {
  it('builds config from the network env + pool id', () => {
    expect(poolSourceConfigFrom(POOL, LIVE_ENV)).toEqual({
      rpcUrl: LIVE_ENV.STELLAR_RPC_URL,
      networkPassphrase: LIVE_ENV.STELLAR_NETWORK_PASSPHRASE,
      poolId: POOL,
    });
  });

  it('is null without the network env — mock mode never constructs a pool client', () => {
    expect(poolSourceConfigFrom(POOL, {})).toBeNull();
  });

  it('is null with no pool id even when the network env is present', () => {
    expect(poolSourceConfigFrom('', LIVE_ENV)).toBeNull();
  });
});
