/**
 * The LIVE {@link ApySource} (U4) — the production wiring that makes `/holdings`, `/rates`, and
 * `/pools/:id` quote a pool's real on-chain `rate_bps()` instead of a catalog constant. Built in the
 * HTTP server (never imported by the pure `venue-meta.ts`), so the RPC dependency stays at the edge.
 *
 * For each of the keeper's demo pools it holds a `pool-rate` reader bound to that pool's on-chain
 * address (`YIELD_POOL_<CCY>`, or the legacy `BLEND_POOL_<CCY>`); a request for that pool reads the
 * chain. Every other vetted pool (the unallocated Safe candidates / exit targets that are not deployed)
 * resolves through the pure {@link catalogApy}, so the read never invents an RPC call for a pool that
 * has no contract. A wired pool whose live read *fails* propagates that typed error — it does NOT fall
 * back to the catalog figure (KTD7: a stale rate the user acts on is worse than a legible 503). The
 * catalog fallback is only for a pool with no address configured (mock/partial env).
 */

import { catalogApy, type ApySource } from './venue-meta.js';
import { makePoolRateReader, type PoolRateReader } from '../tools/pool-rate.js';
import { demoPoolFor } from '../tools/vault.js';

/**
 * Build the live APY source from env. Returns a source that reads `rate_bps()` for any demo pool with a
 * configured address, and defers to the catalog for everything else. Safe to call in mock mode too — it
 * simply finds no addresses and behaves like {@link catalogApy}.
 */
export function makeLiveApySource(env: NodeJS.ProcessEnv = process.env): ApySource {
  const readers = new Map<string, PoolRateReader>();

  const usd = env.YIELD_POOL_USD ?? env.BLEND_POOL_USD;
  if (usd) readers.set(demoPoolFor('USD'), makePoolRateReader(usd, { env }));
  const eur = env.YIELD_POOL_EUR ?? env.BLEND_POOL_EUR;
  if (eur) readers.set(demoPoolFor('EUR'), makePoolRateReader(eur, { env }));

  return async (poolId: string) => {
    const reader = readers.get(poolId);
    return reader ? reader() : catalogApy(poolId);
  };
}
