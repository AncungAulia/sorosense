/**
 * Normalized per-pool data for the allocator and Sentinel: APY and liquidity in one shape.
 * Base metadata comes from the vetted catalog; live reserve/liquidity refresh from on-chain reads
 * (Blend SDK / RPC) is layered on in U9/U20. Unknown or trap pools return a typed error.
 */

import { getVenue } from './catalog.js';
import { err, ok, type Result } from '../lib/result.js';

export interface PoolData {
  poolId: string;
  currency: 'USD' | 'EUR' | 'MXN';
  apy: number;
  /** Liquidity proxy (USD). Seeded from catalog TVL; refined by live reserves in U9/U20. */
  liquidityUsd: number;
}

export function getPoolData(poolId: string): Result<PoolData> {
  const venue = getVenue(poolId);
  if (!venue) return err('not_found', `unknown or non-vetted pool: ${poolId}`);
  return ok({
    poolId: venue.id,
    currency: venue.currency,
    apy: venue.apy,
    liquidityUsd: venue.tvlUsd,
  });
}
