/**
 * Pool lookup (R13) — the display data for one vetted pool, keyed by the seam's `PoolId`.
 *
 * Its one consumer today is the **exit-approval sheet**: when the Sentinel freezes a pool it proposes a
 * safe target (`ExitProposal.toPool`), and the sheet must name that target and quote its rate before the
 * user signs. That was the frontend's `POOL_META` constant — a two-entry map that knows nothing about
 * the pool the keeper actually proposed on-chain.
 *
 * Reads the vetted catalog through `venue-meta.ts` (`resolveVenue`), so a trap id and an unknown id both
 * resolve to `null` — the route turns that into a shaped 404, never a silent `null` that renders as a
 * blank sheet. Pure: no vault, no FX, no network, and no risk/label/score field.
 */

import { err, ok, type Result } from '../lib/result.js';
import { catalogApy, resolveVenue, type ApySource } from './venue-meta.js';

/** Display data for one vetted pool — an exit target, named and rated. No risk field. */
export interface Pool {
  /** The seam's `PoolId` slug, e.g. "blend-eurc". */
  id: string;
  /** Venue full name, e.g. "Blend EURC". */
  name: string;
  /** Provider, e.g. "Blend". */
  venue: string;
  apy: number;
}

/**
 * One vetted pool by id. `err('not_found')` for an unknown or trap id (the caller must not render a
 * partial — it becomes a shaped 404). The APY is the injected {@link ApySource} (live `rate_bps()` in
 * production, catalog figure offline); a failed live read is that read's typed error, not a stale
 * constant, so the exit-approval sheet never quotes a rate that is no longer true (R2, KTD7).
 */
export async function getPool(poolId: string, apy: ApySource = catalogApy): Promise<Result<Pool>> {
  const meta = resolveVenue(poolId);
  if (!meta) return err('not_found', `unknown pool: ${poolId}`);
  const rate = await apy(poolId);
  if (!rate.ok) return rate;
  return ok({ id: meta.id, name: meta.name, venue: meta.venue, apy: rate.value });
}
