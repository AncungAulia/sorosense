/**
 * `getPool` — the exit target's display data (R13). Object-real against the vetted catalog.
 */

import { describe, expect, it } from 'vitest';
import { getPool } from './pools.js';

describe('getPool', () => {
  it('names and rates a vetted pool by its seam PoolId', () => {
    expect(getPool('blend-eurc')).toEqual({
      id: 'blend-eurc',
      name: 'Blend EURC',
      venue: 'Blend',
      apy: 5.1,
    });
  });

  it('resolves every currency’s demo pool the keeper can propose an exit to', () => {
    expect(getPool('defindex-usdc')?.name).toBe('DeFindex USDC vault');
    expect(getPool('blend-usdc')?.venue).toBe('Blend');
    expect(getPool('etherfuse-cetes')?.apy).toBe(5.57);
  });

  it('returns null for an unknown pool — the caller must 404, not render a blank sheet', () => {
    expect(getPool('pool-that-does-not-exist')).toBeNull();
    expect(getPool('')).toBeNull();
  });

  it('returns null for a trap pool (a trap is never a safe exit target)', () => {
    for (const trap of ['usst-squatter', 'mgusd', 'ghost-97', 'yieldblox-eurc', 'ylds-kyc']) {
      expect(getPool(trap)).toBeNull();
    }
  });

  it('exposes no risk/label/score/tier field (safety is invisible)', () => {
    const pool = getPool('blend-eurc');
    expect(pool).not.toBeNull();
    for (const key of ['risk', 'label', 'score', 'tier']) {
      expect(pool).not.toHaveProperty(key);
    }
  });
});
