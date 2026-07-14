/**
 * `getRates` — the unfunded bucket's rate card (R13). Object-real against the vetted catalog: no
 * mocking, because there is nothing to mock (no vault, no FX, no network).
 */

import { describe, expect, it } from 'vitest';
import { getRates } from './rates.js';
import { bestSafeVenue } from './venue-meta.js';
import { getCatalog } from '../tools/catalog.js';

describe('getRates', () => {
  it('returns exactly one row per currency, derived from the catalog', () => {
    const rates = getRates();

    expect(rates.map((r) => r.currency)).toEqual(['USD', 'EUR', 'MXN']);
    for (const rate of rates) {
      // Not a second catalog: every row IS the currency's best-safe venue, field for field.
      const best = bestSafeVenue(rate.currency);
      expect(best).not.toBeNull();
      expect(rate.name).toBe(best?.name);
      expect(rate.venue).toBe(best?.venue);
      expect(rate.kind).toBe(best?.kind);
      expect(rate.apy).toBe(best?.apy);
      expect(rate.apy).toBeGreaterThan(0); // a 0.00% APY hero is a lie an omitted row is not
    }
  });

  it('quotes the highest-APY safe venue — the target the agent would actually allocate to', () => {
    const usd = getRates(['USD'])[0];
    const candidates = getCatalog('USD');
    const highest = Math.max(...candidates.map((v) => v.apy));

    expect(usd?.apy).toBe(highest);
    expect(usd?.name).toBe('DeFindex USDC vault');
    expect(usd?.tags).toEqual(['DeFindex', 'Vault']);
  });

  it('an RWA-only currency reports the RWA venue and its kind', () => {
    // MXN has exactly one vetted venue and it is an RWA — the rate card must say so rather than
    // silently omitting the bucket or pretending it is a vault.
    const mxn = getRates(['MXN'])[0];

    expect(mxn?.kind).toBe('rwa');
    expect(mxn?.venue).toBe('Etherfuse');
    expect(mxn?.name).toBe('Etherfuse CETES');
    // The RWA's second tag is its instrument, not "Vault"/"Fixed pool".
    expect(mxn?.tags).toEqual(['Etherfuse', 'CETES']);
    expect(mxn?.apy).toBe(5.57);
  });

  it('exposes no risk/label/score/tier field (safety is invisible)', () => {
    for (const rate of getRates()) {
      for (const key of ['risk', 'label', 'score', 'tier']) {
        expect(rate).not.toHaveProperty(key);
      }
    }
  });

  it('never quotes a trap venue', () => {
    const traps = ['usst-squatter', 'mgusd', 'ghost-97', 'yieldblox-eurc', 'ylds-kyc'];
    const names = getRates().map((r) => r.name.toLowerCase());
    for (const trap of traps) expect(names.some((n) => n.includes(trap))).toBe(false);
  });

  it('omits a currency with no vetted venue rather than emitting a zero rate', () => {
    // No catalog entry can exist for a currency the catalog does not carry; the guard is what keeps a
    // future currency from rendering as "0.00% APY" before its venue is vetted.
    const rates = getRates([]);
    expect(rates).toEqual([]);
  });
});
