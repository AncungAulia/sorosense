/**
 * Venue-metadata helpers (R6) — the single catalog-derived source the holdings and funding reads
 * share (DRY). Pure: reads the vetted catalog only, never the seam or FX, and never a risk label.
 *
 * The frontend currently hardcodes this venue/APY/tag data (`frontend/lib/vault/data.ts`); exposing
 * it here lets integration (STE-21) swap the hardcode for backend truth.
 */

import type { Currency } from '@sorosense/vault-client';
import { err, ok, type Result } from '../lib/result.js';
import { getCatalog, getVenue, type CatalogEntry, type VenueKind } from '../tools/catalog.js';

/** Display-ready venue metadata for one vetted pool. No risk field (safety is invisible). */
export interface VenueMeta {
  id: string;
  /** Provider name, e.g. "DeFindex", "Blend". */
  venue: string;
  /** Full venue name, e.g. "DeFindex USDC vault". */
  name: string;
  kind: VenueKind;
  apy: number;
}

function toMeta(v: CatalogEntry): VenueMeta {
  return { id: v.id, venue: v.venue, name: v.name, kind: v.kind, apy: v.apy };
}

/** Resolve a pool id to its vetted venue metadata; null for unknown or trap ids. Subsumes the
 *  frontend's `getPoolMeta` (exit-target display). */
export function resolveVenue(poolId: string): VenueMeta | null {
  const v = getVenue(poolId);
  return v ? toMeta(v) : null;
}

/**
 * The APY (percent) source for a pool id — the seam that lets a read surface quote the **live**
 * on-chain rate instead of the catalog figure (R2, KTD7). `venue-meta.ts` stays pure: it declares the
 * shape and the pure default, while the *live* implementation (which reads `rate_bps()` over RPC) is
 * built in the HTTP server and injected, the way FX is. A failure is a typed `Result` — the route maps
 * it to a shaped non-200, never a stale constant rendered as truth.
 */
export type ApySource = (poolId: string) => Promise<Result<number>>;

/**
 * The pure, offline default {@link ApySource}: the catalog's own figure for the pool. It touches no
 * network, so the whole test suite and every mock-mode run resolve an APY without RPC. A live source
 * (HTTP server) wraps this and overlays the real `rate_bps()` read for the pools that are deployed.
 */
export const catalogApy: ApySource = async (poolId: string): Promise<Result<number>> => {
  const meta = resolveVenue(poolId);
  return meta ? ok(meta.apy) : err('not_found', `unknown pool: ${poolId}`);
};

/** Highest-APY Safe venue for a currency — the agent's default target when a bucket is unallocated. */
export function bestSafeVenue(currency: Currency): VenueMeta | null {
  const safe = getCatalog(currency);
  if (safe.length === 0) return null;
  const best = safe.reduce((b, v) => (v.apy > b.apy ? v : b), safe[0]!);
  return toMeta(best);
}

/**
 * Second display tag for a venue, matching the frontend's bucket tags: a lending pool reads "Fixed
 * pool", a vault reads "Vault", and an RWA reads its instrument (the last word of its name, e.g.
 * "Etherfuse CETES" → "CETES"). The venue name itself is the first tag.
 */
export function kindLabel(kind: VenueKind, name: string): string {
  switch (kind) {
    case 'vault':
      return 'Vault';
    case 'lending':
      return 'Fixed pool';
    case 'rwa':
      return name.trim().split(/\s+/).pop() ?? name;
  }
}
