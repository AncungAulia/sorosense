import { afterEach, describe, expect, it, vi } from 'vitest';
import { getCatalog, getDefindexVaults, TRAP_VENUES } from './catalog.js';

afterEach(() => vi.unstubAllGlobals());

describe('getCatalog', () => {
  it('excludes every trap venue', () => {
    const ids = new Set(getCatalog().map((v) => v.id));
    for (const trap of TRAP_VENUES) {
      expect(ids.has(trap.id)).toBe(false);
    }
    // and returns some vetted venues
    expect(getCatalog().length).toBeGreaterThan(0);
  });

  it('filters by currency (independent buckets)', () => {
    expect(getCatalog('MXN').every((v) => v.currency === 'MXN')).toBe(true);
    expect(getCatalog('USD').some((v) => v.id === 'blend-usdc')).toBe(true);
    expect(getCatalog('USD').every((v) => v.currency === 'USD')).toBe(true);
  });
});

describe('getDefindexVaults', () => {
  it('returns vaults on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Response(JSON.stringify({ vaults: [{ address: 'C1' }] }), { status: 200 })),
    );
    const r = await getDefindexVaults('https://api.test');
    expect(r.ok && r.value.length).toBe(1);
  });

  it('surfaces a network failure as a typed error, not a throw', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        throw new Error('ECONNREFUSED');
      }),
    );
    const r = await getDefindexVaults('https://api.test');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('unavailable');
  });
});
