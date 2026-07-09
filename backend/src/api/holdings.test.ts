import { describe, expect, it } from 'vitest';
import type { Address, Currency, PoolStatus } from '@sorosense/vault-client';

import { ok, err } from '../lib/result.js';
import { getHoldings, type HoldingsDeps, type FxSource } from './holdings.js';

const USER: Address = 'alice';
const UNIT = 10_000_000n; // 7-dp stroops scale, mirrors frontend units

interface BucketStub {
  shares?: bigint;
  value?: bigint;
  pool?: string | null;
  status?: PoolStatus;
}

/**
 * Vault stub returning fixed per-bucket reads. `shares`/`value` default to 0n, `pool` to null
 * (unallocated), `status` to 'active'. Only the four reads `getHoldings` touches are implemented.
 */
const stubVault = (buckets: Partial<Record<Currency, BucketStub>>) => ({
  balanceOf: async (_u: Address, c: Currency) => buckets[c]?.shares ?? 0n,
  assetValueOf: async (_u: Address, c: Currency) => buckets[c]?.value ?? 0n,
  activePool: async (c: Currency) => buckets[c]?.pool ?? null,
  poolStatus: async (pool: string): Promise<PoolStatus> => {
    for (const b of Object.values(buckets)) if (b?.pool === pool) return b.status ?? 'active';
    return 'active';
  },
});

/** FX stub: USD (and unspecified buckets) default to 1; others take the map value. */
const okFx = (map: Partial<Record<Currency, number>> = {}): FxSource => async (c) => ok(map[c] ?? 1);

describe('getHoldings — allocated bucket (AE1)', () => {
  it('resolves venue/kind/apy/tags from the active pool', async () => {
    const res = await getHoldings(
      USER,
      { vault: stubVault({ USD: { shares: 50n, value: 100n, pool: 'defindex-usdc' } }), fx: okFx() },
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value).toHaveLength(1);
    const h = res.value[0]!;
    expect(h.venue).toBe('DeFindex');
    expect(h.name).toBe('DeFindex USDC vault');
    expect(h.kind).toBe('vault');
    expect(h.apy).toBe(8.59);
    expect(h.tags).toEqual(['DeFindex', 'Vault']);
    expect(h.shares).toBe(50n);
    expect(h.value).toBe(100n); // straight from assetValueOf
    expect(h.frozen).toBe(false);
  });
});

describe('getHoldings — frozen active pool (AE2)', () => {
  it('marks frozen when poolStatus is "frozen"', async () => {
    const res = await getHoldings(
      USER,
      {
        vault: stubVault({ USD: { shares: 10n, value: 10n, pool: 'defindex-usdc', status: 'frozen' } }),
        fx: okFx(),
      },
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value[0]!.frozen).toBe(true);
  });
});

describe('getHoldings — unallocated bucket (AE3)', () => {
  it('falls back to the currency best-safe venue when activePool is null', async () => {
    const res = await getHoldings(
      USER,
      { vault: stubVault({ USD: { shares: 5n, value: 5n, pool: null } }), fx: okFx() },
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const h = res.value[0]!;
    // best-safe USD is defindex-usdc (8.59) — the agent's default target.
    expect(h.venue).toBe('DeFindex');
    expect(h.apy).toBe(8.59);
    expect(h.frozen).toBe(false); // no pool → never frozen
  });
});

describe('getHoldings — FX failure (AE4)', () => {
  it('returns the error, never a silent $0', async () => {
    const failingFx: FxSource = async (c) => (c === 'EUR' ? err('unavailable', 'reflector down') : ok(1));
    const res = await getHoldings(
      USER,
      { vault: stubVault({ EUR: { shares: 1n, value: 1n, pool: 'blend-eurc' } }), fx: failingFx },
    );
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe('unavailable');
  });
});

describe('getHoldings — empty buckets', () => {
  it('skips buckets with zero shares', async () => {
    const res = await getHoldings(
      USER,
      {
        vault: stubVault({
          USD: { shares: 0n, value: 0n },
          EUR: { shares: 10n, value: 10n, pool: 'blend-eurc' },
        }),
        fx: okFx(),
      },
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.map((h) => h.currency)).toEqual(['EUR']);
  });
});

describe('getHoldings — valueUsd conversion', () => {
  it('converts native value by UNIT then FX rate', async () => {
    const res = await getHoldings(
      USER,
      {
        vault: stubVault({ EUR: { shares: 100n, value: 100n * UNIT, pool: 'blend-eurc' } }),
        fx: okFx({ EUR: 1.14 }),
      },
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // (100*UNIT / 1e7) * 1.14 = 100 * 1.14 = 114
    expect(res.value[0]!.valueUsd).toBeCloseTo(114, 6);
  });
});

describe('getHoldings — multi-currency', () => {
  it('returns each funded bucket in currencies order', async () => {
    const res = await getHoldings(
      USER,
      {
        vault: stubVault({
          USD: { shares: 1n, value: 1n, pool: 'defindex-usdc' },
          EUR: { shares: 2n, value: 2n, pool: 'blend-eurc' },
        }),
        fx: okFx({ EUR: 1.14 }),
      } as HoldingsDeps,
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.map((h) => h.currency)).toEqual(['USD', 'EUR']);
    expect(res.value[1]!.venue).toBe('Blend');
  });
});

describe('getHoldings — invariants (AE6)', () => {
  it('exposes NO risk/label/score/tier field on a holding', async () => {
    const res = await getHoldings(
      USER,
      { vault: stubVault({ MXN: { shares: 3n, value: 3n, pool: 'etherfuse-cetes' } }), fx: okFx({ MXN: 0.05 }) },
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const forbidden = ['risk', 'riskLabel', 'label', 'safe', 'score', 'tier'];
    const h = res.value[0]! as unknown as Record<string, unknown>;
    for (const key of forbidden) expect(key in h).toBe(false);
    // RWA kindLabel is the instrument (last word of the name).
    expect((res.value[0]!).tags).toEqual(['Etherfuse', 'CETES']);
  });
});
