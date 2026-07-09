/**
 * E2E integration — the holdings/funding reads wired against the REAL MockVaultClient (NAV share
 * math), seeded to a funded + frozen state that mirrors `frontend/lib/vault/seed.ts`, plus the real
 * catalog via venue-meta. Proves the whole chain end-to-end: getHoldings produces BucketView-shaped
 * output with correct venue/APY/frozen, is read-only, and getFundingOptions lists the right options.
 *
 * Buckets are allocated to CATALOG pool ids (not the frontend seed's placeholder ids) so venue-meta
 * resolves — this is the integration mapping KTD5 defers to STE-21.
 */

import { describe, expect, it } from 'vitest';
import { MockVaultClient, mockSigner, type Currency } from '@sorosense/vault-client';

import { ok, type Result } from '../lib/result.js';
import { getHoldings, type FxSource } from './holdings.js';
import { getFundingOptions } from './funding.js';

const UNIT = 10_000_000n; // 7-dp stroops scale
const alice = mockSigner('depositor', 'alice');
const keeper = mockSigner('keeper', 'sentinel');
const okFx = (map: Partial<Record<Currency, number>> = {}): FxSource => async (c) => ok(map[c] ?? 1);

const unwrap = <T>(r: Result<T>): T => {
  if (!r.ok) throw new Error(`expected ok, got ${r.code}: ${r.error}`);
  return r.value;
};

/** Funded state mirroring the frontend seed: USD in DeFindex (healthy), EUR in Blend (frozen). */
async function seedFunded(vault: MockVaultClient): Promise<void> {
  await vault.deposit('alice', 'USD', 1000n * UNIT).signAndSubmit(alice);
  await vault.deposit('alice', 'EUR', 900n * UNIT).signAndSubmit(alice);
  await vault.allocate('defindex-usdc', 'USD', 1000n * UNIT).signAndSubmit(keeper);
  await vault.allocate('blend-eurc', 'EUR', 900n * UNIT).signAndSubmit(keeper);
  vault.simulateYield('USD', 100n * UNIT); // ~ +$100
  vault.simulateYield('EUR', 80n * UNIT);
  await vault.freeze('blend-eurc').signAndSubmit(keeper); // EUR pool paused (Sentinel)
}

describe('holdings/funding e2e against the mock vault', () => {
  it('getHoldings yields BucketView-shaped buckets with correct venue/APY/frozen', async () => {
    const vault = new MockVaultClient();
    await seedFunded(vault);

    const holdings = unwrap(await getHoldings('alice', { vault, fx: okFx({ EUR: 1.1 }) }));

    expect(holdings.map((h) => h.currency)).toEqual(['USD', 'EUR']);

    const usd = holdings.find((h) => h.currency === 'USD')!;
    expect(usd.venue).toBe('DeFindex');
    expect(usd.kind).toBe('vault');
    expect(usd.apy).toBe(8.59);
    expect(usd.tags).toEqual(['DeFindex', 'Vault']);
    expect(usd.frozen).toBe(false);
    expect(usd.valueUsd).toBeGreaterThan(1090); // ~1100 after yield
    expect(usd.valueUsd).toBeLessThanOrEqual(1100);

    const eur = holdings.find((h) => h.currency === 'EUR')!;
    expect(eur.venue).toBe('Blend');
    expect(eur.kind).toBe('lending');
    expect(eur.apy).toBe(5.1);
    expect(eur.tags).toEqual(['Blend', 'Fixed pool']);
    expect(eur.frozen).toBe(true); // Blend EUR pool frozen
    expect(eur.valueUsd).toBeGreaterThan(1060); // ~980 EUR × 1.1 ≈ 1078
    expect(eur.valueUsd).toBeLessThan(1090);
  });

  it('each holding carries every BucketView field (drop-in) and no forbidden field', async () => {
    const vault = new MockVaultClient();
    await seedFunded(vault);
    const [h] = unwrap(await getHoldings('alice', { vault, fx: okFx() }));
    for (const key of ['currency', 'name', 'venue', 'tags', 'apy', 'shares', 'value', 'valueUsd', 'frozen']) {
      expect(key in h!).toBe(true);
    }
    for (const key of ['risk', 'label', 'score', 'tier']) {
      expect(key in (h as unknown as Record<string, unknown>)).toBe(false);
    }
  });

  it('is read-only — computing holdings moves no funds', async () => {
    const vault = new MockVaultClient();
    await seedFunded(vault);
    const before = await vault.balanceOf('alice', 'USD');
    await getHoldings('alice', { vault, fx: okFx() });
    expect(await vault.balanceOf('alice', 'USD')).toBe(before);
  });

  it('getFundingOptions lists stablecoins + apy-less RWA, no traps', () => {
    const { stablecoins, rwa } = getFundingOptions();
    expect(stablecoins.map((s) => s.sym).sort()).toEqual(['CETES', 'EURC', 'USDC']);
    expect(rwa.length).toBeGreaterThan(0);
    for (const r of rwa) expect('apy' in r).toBe(false);
    const ids = rwa.map((r) => r.id);
    expect(ids).toContain('etherfuse-cetes');
    expect(ids).not.toContain('usst-squatter'); // trap excluded
  });
});
