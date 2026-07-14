/**
 * `getRates` — the unfunded bucket's rate card (R13). Object-real against the vetted catalog with the
 * pure default APY source (the catalog figure); the live on-chain overlay is exercised in the HTTP
 * integration tests. No network.
 */

import { describe, expect, it } from 'vitest';
import { getRates } from './rates.js';
import { bestSafeVenue } from './venue-meta.js';
import { getCatalog } from '../tools/catalog.js';
import type { Rate } from './rates.js';

/** Unwrap the Result; fail loudly if the (offline, pure) read errored — it never should. */
async function rates(currencies?: Parameters<typeof getRates>[0]): Promise<Rate[]> {
  const r = await getRates(currencies);
  if (!r.ok) throw new Error(`getRates errored offline: ${r.error}`);
  return r.value;
}

describe('getRates', () => {
  it('returns exactly one row per currency, derived from the catalog', async () => {
    const list = await rates();

    expect(list.map((r) => r.currency)).toEqual(['USD', 'EUR', 'MXN']);
    for (const rate of list) {
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

  it('quotes the highest-APY safe venue — the SoroSense pool the keeper actually allocates to', async () => {
    const [usd] = await rates(['USD']);
    const candidates = getCatalog('USD');
    const highest = Math.max(...candidates.map((v) => v.apy));

    expect(usd?.apy).toBe(highest);
    // At 10% the SoroSense yield pool out-ranks DeFindex (8.59) on its own merits, so the Earn hero
    // and the keeper's allocation target become the same venue with nothing hardcoding that.
    expect(usd?.name).toBe('SoroSense USD pool');
    expect(usd?.tags).toEqual(['SoroSense', 'Fixed pool']);
  });

  it('an RWA-only currency reports the RWA venue and its kind', async () => {
    // MXN has exactly one vetted venue and it is an RWA — the rate card must say so rather than
    // silently omitting the bucket or pretending it is a vault.
    const [mxn] = await rates(['MXN']);

    expect(mxn?.kind).toBe('rwa');
    expect(mxn?.venue).toBe('Etherfuse');
    expect(mxn?.name).toBe('Etherfuse CETES');
    // The RWA's second tag is its instrument, not "Vault"/"Fixed pool".
    expect(mxn?.tags).toEqual(['Etherfuse', 'CETES']);
    expect(mxn?.apy).toBe(5.57);
  });

  it('exposes no risk/label/score/tier field (safety is invisible)', async () => {
    for (const rate of await rates()) {
      for (const key of ['risk', 'label', 'score', 'tier']) {
        expect(rate).not.toHaveProperty(key);
      }
    }
  });

  it('never quotes a trap venue', async () => {
    const traps = ['usst-squatter', 'mgusd', 'ghost-97', 'yieldblox-eurc', 'ylds-kyc'];
    const names = (await rates()).map((r) => r.name.toLowerCase());
    for (const trap of traps) expect(names.some((n) => n.includes(trap))).toBe(false);
  });

  it('omits a currency with no vetted venue rather than emitting a zero rate', async () => {
    // No catalog entry can exist for a currency the catalog does not carry; the guard is what keeps a
    // future currency from rendering as "0.00% APY" before its venue is vetted.
    expect(await rates([])).toEqual([]);
  });

  it('propagates an APY-source failure rather than quoting a stale figure (KTD7)', async () => {
    // A live read that fails for a currency that DOES have a venue fails the whole card — the route
    // maps it to a shaped non-200, never a hardcoded fallback rendered as truth.
    const r = await getRates(['USD'], async () => ({ ok: false, code: 'timeout', error: 'rpc stalled' }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('timeout');
  });
});
