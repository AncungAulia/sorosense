/**
 * The live APY source (U4) — offline-safe tests. It reads `rate_bps()` for the keeper's demo pools and
 * defers to the catalog for everything else. We prove the routing without a network by pointing a demo
 * pool at a malformed address (which fails at contract construction, before any RPC call): a demo slug
 * takes the live path (→ typed error here), a non-demo slug takes the pure catalog path.
 */

import { describe, expect, it } from 'vitest';
import { makeLiveApySource } from './live-apy.js';

const NET_ENV = {
  STELLAR_RPC_URL: 'https://soroban-testnet.stellar.org',
  STELLAR_NETWORK_PASSPHRASE: 'Test SDF Network ; September 2015',
};

describe('makeLiveApySource', () => {
  it('routes a configured demo pool to the live read (not the catalog figure)', async () => {
    // A malformed pool address fails at `new Contract(...)` on the first read — offline, no RPC — so a
    // typed error here proves the demo slug went through the live reader rather than the catalog.
    const apy = makeLiveApySource({ ...NET_ENV, YIELD_POOL_USD: 'not-a-strkey' });
    const r = await apy('sorosense-usd');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('unavailable');
  });

  it('defers a non-demo pool to the catalog even when a demo address is configured', async () => {
    const apy = makeLiveApySource({ ...NET_ENV, YIELD_POOL_USD: 'not-a-strkey' });
    // blend-eurc is a Safe candidate / exit target, not a deployed demo pool → pure catalog figure.
    const r = await apy('blend-eurc');
    expect(r).toEqual({ ok: true, value: 5.1 });
  });

  it('with no pool address configured, a demo slug falls back to the catalog figure (mock mode)', async () => {
    const apy = makeLiveApySource({}); // nothing wired
    const r = await apy('sorosense-usd');
    expect(r).toEqual({ ok: true, value: 10 }); // SOROSENSE_POOL_FALLBACK_APY
  });

  it('honours the legacy BLEND_POOL_* names as a fallback address', async () => {
    const apy = makeLiveApySource({ ...NET_ENV, BLEND_POOL_EUR: 'not-a-strkey' });
    const r = await apy('sorosense-eur'); // demo slug, address from the legacy env name
    expect(r.ok).toBe(false); // went live (construction fails), did not read catalog
  });

  it('errs not_found for an unknown pool (via the catalog default)', async () => {
    const apy = makeLiveApySource({});
    const r = await apy('pool-that-does-not-exist');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('not_found');
  });
});
