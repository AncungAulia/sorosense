import { describe, expect, it } from 'vitest';
import { getFundingOptions } from './funding.js';

describe('getFundingOptions', () => {
  it('AE5: every rwa entry omits apy (rate shown at deposit)', () => {
    const { rwa } = getFundingOptions();
    expect(rwa.length).toBeGreaterThan(0);
    for (const entry of rwa) expect('apy' in entry).toBe(false);
  });

  it('rwa lists the catalog RWA venues with correct currency and no trap ids', () => {
    const { rwa } = getFundingOptions();
    const byId = new Map(rwa.map((r) => [r.id, r]));
    expect(byId.get('ondo-usdy')?.currency).toBe('USD');
    expect(byId.get('etherfuse-cetes')?.currency).toBe('MXN');
    for (const trap of ['usst-squatter', 'mgusd', 'ghost-97', 'yieldblox-eurc', 'ylds-kyc']) {
      expect(byId.has(trap)).toBe(false);
    }
  });

  it('stablecoins include USDC/EURC/CETES with correct currency and chains', () => {
    const { stablecoins } = getFundingOptions();
    const bySym = new Map(stablecoins.map((s) => [s.sym, s]));
    expect(bySym.get('USDC')).toEqual({ sym: 'USDC', currency: 'USD', chains: ['Stellar'] });
    expect(bySym.get('EURC')).toEqual({ sym: 'EURC', currency: 'EUR', chains: ['Stellar'] });
    expect(bySym.get('CETES')).toEqual({
      sym: 'CETES',
      currency: 'MXN',
      chains: ['Stellar', 'Solana'],
    });
    expect(bySym.get('CETES')?.chains).toContain('Solana');
  });

  it('AE6: exposes no risk/label/score/tier field anywhere in the returned object', () => {
    const options = getFundingOptions();
    const objects: Record<string, unknown>[] = [
      options as unknown as Record<string, unknown>,
      ...options.stablecoins.map((s) => s as unknown as Record<string, unknown>),
      ...options.rwa.map((r) => r as unknown as Record<string, unknown>),
    ];
    for (const obj of objects) {
      for (const k of ['risk', 'label', 'score', 'tier']) expect(k in obj).toBe(false);
    }
  });
});
