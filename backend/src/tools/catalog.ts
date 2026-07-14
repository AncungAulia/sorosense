/**
 * The internal vetted venue catalog (R19/R20). This drives allocation — it is NOT a user-facing
 * feed. `getCatalog()` returns only venues that passed vetting; traps (squatter assets,
 * issuer-keeps-yield, dead/exploited pools, KYC walls) are excluded from allocation but kept in
 * `TRAP_VENUES` as evidence for the pitch, never surfaced in the app.
 *
 * Figures are seeded from the 2026-07-03 live probe (docs/research/2026-07-03-stellar-yield-hub-catalog.md).
 * Live APY/TVL refresh is layered on in U9 via {@link getDefindexVaults} and DefiLlama.
 */

import { getJson } from '../lib/http.js';
import { err, ok, type Result } from '../lib/result.js';
import { DEFAULT_YIELD_RATE_BPS, type Currency } from '@sorosense/vault-client';

/**
 * The offline APY (percent) for the demo `yield_pool`s the keeper actually allocates into — the
 * fallback quoted when the on-chain `rate_bps()` read is unavailable, derived from the seam's
 * `DEFAULT_YIELD_RATE_BPS` (KTD8) so it is not a second magic number. Live mode overlays the real
 * chain read (`tools/pool-rate.ts`); this is what keeps a mock/dev run answering without a network.
 */
export const SOROSENSE_POOL_FALLBACK_APY = DEFAULT_YIELD_RATE_BPS / 100;

export type VenueKind = 'lending' | 'vault' | 'rwa';
export type TrapReason = 'squatter-asset' | 'issuer-keeps-yield' | 'dead-pool' | 'ghost' | 'kyc-wall';

export interface CatalogEntry {
  id: string;
  name: string;
  venue: string;
  currency: Currency;
  kind: VenueKind;
  apy: number;
  tvlUsd: number;
}

export interface TrapEntry {
  id: string;
  name: string;
  reason: TrapReason;
}

/**
 * Sentinel-vetted Safe venues the allocator may draw from. The `sorosense-*` entries are the demo
 * `yield_pool`s the keeper actually allocates into — their APY is the on-chain `rate_bps()` read live
 * (`tools/pool-rate.ts`), and {@link SOROSENSE_POOL_FALLBACK_APY} only when that read is unavailable.
 * At 10% they out-rank the other Safe candidates on their own merits, so `bestSafeVenue` picks the same
 * venue the keeper drives — nobody hardcodes that they should match. The `blend-*` / `defindex-*` /
 * `ondo-*` entries stay as unallocated Safe candidates (and exit targets).
 */
const SAFE_VENUES: readonly CatalogEntry[] = [
  { id: 'sorosense-usd', name: 'SoroSense USD pool', venue: 'SoroSense', currency: 'USD', kind: 'lending', apy: SOROSENSE_POOL_FALLBACK_APY, tvlUsd: 0 },
  { id: 'blend-usdc', name: 'Blend USDC', venue: 'Blend', currency: 'USD', kind: 'lending', apy: 6.6, tvlUsd: 4_200_000 },
  { id: 'defindex-usdc', name: 'DeFindex USDC vault', venue: 'DeFindex', currency: 'USD', kind: 'vault', apy: 8.59, tvlUsd: 1_100_000 },
  { id: 'ondo-usdy', name: 'Ondo USDY', venue: 'Ondo', currency: 'USD', kind: 'rwa', apy: 4.65, tvlUsd: 3_800_000 },
  { id: 'sorosense-eur', name: 'SoroSense EUR pool', venue: 'SoroSense', currency: 'EUR', kind: 'lending', apy: SOROSENSE_POOL_FALLBACK_APY, tvlUsd: 0 },
  { id: 'blend-eurc', name: 'Blend EURC', venue: 'Blend', currency: 'EUR', kind: 'lending', apy: 5.1, tvlUsd: 640_000 },
  { id: 'etherfuse-cetes', name: 'Etherfuse CETES', venue: 'Etherfuse', currency: 'MXN', kind: 'rwa', apy: 5.57, tvlUsd: 900_000 },
];

/** Traps excluded from allocation — evidence for the pitch, never a user-facing screen (R20). */
export const TRAP_VENUES: readonly TrapEntry[] = [
  { id: 'usst-squatter', name: 'USST (squatter asset)', reason: 'squatter-asset' },
  { id: 'mgusd', name: 'MGUSD', reason: 'issuer-keeps-yield' },
  { id: 'ghost-97', name: '$97 ghost protocol', reason: 'ghost' },
  { id: 'yieldblox-eurc', name: 'YieldBlox EURC (drained)', reason: 'dead-pool' },
  { id: 'ylds-kyc', name: 'YLDS (KYC-gated)', reason: 'kyc-wall' },
];

const TRAP_IDS = new Set(TRAP_VENUES.map((t) => t.id));

/**
 * The vetted catalog the allocator draws from. Traps are never included. Optionally filter by
 * currency to get the candidate Safe set for one bucket.
 */
export function getCatalog(currency?: Currency): CatalogEntry[] {
  return SAFE_VENUES.filter(
    (v) => !TRAP_IDS.has(v.id) && (currency === undefined || v.currency === currency),
  );
}

/** Look up one vetted venue by id (used by pool-data). Returns null for unknown or trap ids. */
export function getVenue(id: string): CatalogEntry | null {
  if (TRAP_IDS.has(id)) return null;
  return SAFE_VENUES.find((v) => v.id === id) ?? null;
}

interface DefindexVault {
  address: string;
  name?: string;
  apy?: number;
  tvl?: number;
}

/**
 * Live DeFindex vaults via the open REST API. Returns a typed Result — a network failure surfaces
 * as an error, never a throw. `baseUrl` is injectable for tests / config.
 */
export async function getDefindexVaults(
  baseUrl = process.env.DEFINDEX_API_URL ?? 'https://api.defindex.io',
): Promise<Result<DefindexVault[]>> {
  const res = await getJson<{ vaults?: DefindexVault[] } | DefindexVault[]>(
    `${baseUrl}/vault/discover`,
  );
  if (!res.ok) return res;
  const vaults = Array.isArray(res.value) ? res.value : (res.value.vaults ?? []);
  if (!Array.isArray(vaults)) return err('parse', 'DeFindex response missing vault list');
  return ok(vaults);
}
