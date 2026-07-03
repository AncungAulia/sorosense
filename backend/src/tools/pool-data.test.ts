import { describe, expect, it } from 'vitest';
import { getPoolData } from './pool-data.js';

describe('getPoolData', () => {
  it('returns normalized APY + liquidity for a known vetted pool', () => {
    const r = getPoolData('defindex-usdc');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.currency).toBe('USD');
      expect(r.value.apy).toBeGreaterThan(0);
      expect(r.value.liquidityUsd).toBeGreaterThan(0);
    }
  });

  it('errors (not_found) for an unknown pool', () => {
    const r = getPoolData('does-not-exist');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('not_found');
  });

  it('refuses a trap pool as non-vetted', () => {
    const r = getPoolData('yieldblox-eurc');
    expect(r.ok).toBe(false);
  });
});
