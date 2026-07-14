import { describe, expect, it } from 'vitest';
import { resolveVenue, bestSafeVenue, kindLabel } from './venue-meta.js';

describe('venue-meta', () => {
  it('resolveVenue maps a vetted pool id to its metadata', () => {
    expect(resolveVenue('defindex-usdc')).toEqual({
      id: 'defindex-usdc',
      venue: 'DeFindex',
      name: 'DeFindex USDC vault',
      kind: 'vault',
      apy: 8.59,
    });
  });

  it('resolveVenue returns null for a trap id', () => {
    expect(resolveVenue('usst-squatter')).toBeNull();
  });

  it('resolveVenue returns null for an unknown id', () => {
    expect(resolveVenue('no-such-pool')).toBeNull();
  });

  it('bestSafeVenue picks the highest-APY Safe venue per currency', () => {
    // USD candidates: sorosense-usd 10, defindex-usdc 8.59, blend-usdc 6.6, ondo-usdy 4.65 → sorosense wins.
    expect(bestSafeVenue('USD')?.id).toBe('sorosense-usd');
    // EUR candidates: sorosense-eur 10, blend-eurc 5.1 → sorosense wins.
    expect(bestSafeVenue('EUR')?.id).toBe('sorosense-eur');
    expect(bestSafeVenue('MXN')?.id).toBe('etherfuse-cetes');
  });

  it('kindLabel matches the frontend bucket tags', () => {
    expect(kindLabel('vault', 'DeFindex USDC vault')).toBe('Vault');
    expect(kindLabel('lending', 'Blend EURC')).toBe('Fixed pool');
    expect(kindLabel('rwa', 'Etherfuse CETES')).toBe('CETES'); // instrument = last word
  });

  it('exposes no risk/label/score field', () => {
    const meta = resolveVenue('blend-eurc') as unknown as Record<string, unknown>;
    for (const k of ['risk', 'label', 'score', 'tier']) expect(k in meta).toBe(false);
  });
});
