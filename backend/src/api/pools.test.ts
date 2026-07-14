/**
 * `getPool` — the exit target's display data (R13). Object-real against the vetted catalog with the
 * pure default APY source (catalog figure); the live on-chain overlay is exercised in HTTP integration.
 */

import { describe, expect, it } from 'vitest';
import { getPool } from './pools.js';

describe('getPool', () => {
  it('names and rates a vetted pool by its seam PoolId', async () => {
    expect(await getPool('blend-eurc')).toEqual({
      ok: true,
      value: { id: 'blend-eurc', name: 'Blend EURC', venue: 'Blend', apy: 5.1 },
    });
  });

  it('resolves the pools the keeper can propose an exit to', async () => {
    const usd = await getPool('sorosense-usd');
    expect(usd.ok && usd.value.name).toBe('SoroSense USD pool');
    const defindex = await getPool('defindex-usdc');
    expect(defindex.ok && defindex.value.venue).toBe('DeFindex');
    const cetes = await getPool('etherfuse-cetes');
    expect(cetes.ok && cetes.value.apy).toBe(5.57);
  });

  it('errs not_found for an unknown pool — the caller must 404, not render a blank sheet', async () => {
    const unknown = await getPool('pool-that-does-not-exist');
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.code).toBe('not_found');
    expect((await getPool('')).ok).toBe(false);
  });

  it('errs not_found for a trap pool (a trap is never a safe exit target)', async () => {
    for (const trap of ['usst-squatter', 'mgusd', 'ghost-97', 'yieldblox-eurc', 'ylds-kyc']) {
      expect((await getPool(trap)).ok).toBe(false);
    }
  });

  it('propagates an APY-source failure rather than quoting a stale figure (KTD7)', async () => {
    const r = await getPool('sorosense-usd', async () => ({ ok: false, code: 'unavailable', error: 'rpc down' }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('unavailable');
  });

  it('exposes no risk/label/score/tier field (safety is invisible)', async () => {
    const pool = await getPool('blend-eurc');
    expect(pool.ok).toBe(true);
    if (pool.ok) {
      for (const key of ['risk', 'label', 'score', 'tier']) {
        expect(pool.value).not.toHaveProperty(key);
      }
    }
  });
});
