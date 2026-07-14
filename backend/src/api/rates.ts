/**
 * Per-currency rate card (R13) — the backend source of truth for the rate of a bucket the user has
 * **not funded yet**: the Earn empty-state hero and the simulator.
 *
 * `getHoldings` correctly omits a zero-share bucket, so a surface that must still quote a rate for it
 * had only one place left to look — the frontend's `BUCKET_META` constant. This is that place, moved
 * behind the seam. It answers the question the holdings read cannot: *if you funded this bucket now,
 * what would the agent allocate it to, and at what rate?* — which is exactly `bestSafeVenue`.
 *
 * Pure and deterministic: it reads the vetted catalog through the SAME `venue-meta.ts` seam that
 * `getHoldings` / `getFundingOptions` use (there is no second catalog, and there must never be), never
 * the vault, never FX, never the network. It is user-independent — no depositor parameter — and carries
 * NO risk/label/score field (safety is invisible).
 */

import type { Currency } from '@sorosense/vault-client';

import { ok, type Result } from '../lib/result.js';
import { ALL_CURRENCIES } from './earnings.js';
import { bestSafeVenue, catalogApy, kindLabel, type ApySource } from './venue-meta.js';

/**
 * The rate card for one currency bucket: the venue the agent would allocate it to, and its APY. Field
 * names mirror {@link import('./holdings.js').Holding} so a funded row and an unfunded card render
 * through the same component — the funded row is the superset (it adds shares/value/frozen).
 */
export interface Rate {
  currency: Currency;
  /** Venue full name, e.g. "DeFindex USDC vault". */
  name: string;
  /** Provider, e.g. "DeFindex". */
  venue: string;
  kind: 'lending' | 'vault' | 'rwa';
  /** `[venue, kindLabel(kind, name)]` — the same display tags a funded bucket carries. */
  tags: string[];
  apy: number;
}

/**
 * The rate card per currency. A currency with no vetted venue is **omitted** rather than emitted with a
 * zero rate — a `0.00% APY` hero is a lie an empty list is not. The APY comes from the injected
 * {@link ApySource} (live on-chain `rate_bps()` in production, the catalog figure offline); if that read
 * fails for a currency that *does* have a venue, the whole card fails with that error rather than
 * quoting a stale constant — the caller maps it to a shaped non-200 (R2, KTD7).
 */
export async function getRates(
  currencies: readonly Currency[] = ALL_CURRENCIES,
  apy: ApySource = catalogApy,
): Promise<Result<Rate[]>> {
  const rates: Rate[] = [];

  for (const currency of currencies) {
    // The agent's default target for an unallocated bucket — the same resolution `getHoldings` applies
    // to a funded-but-unallocated one, so the two surfaces cannot quote different rates.
    const meta = bestSafeVenue(currency);
    if (!meta) continue;

    const rate = await apy(meta.id);
    if (!rate.ok) return rate;

    rates.push({
      currency,
      name: meta.name,
      venue: meta.venue,
      kind: meta.kind,
      tags: [meta.venue, kindLabel(meta.kind, meta.name)],
      apy: rate.value,
    });
  }

  return ok(rates);
}
