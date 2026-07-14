/**
 * The protocol performance fee, for display. A share of **yield**, never principal — so the "net APY"
 * the UI shows is `gross × (1 − fee)`. Kept as one small module so every surface (the home headline, the
 * bucket row) quotes the same net.
 *
 * **Keep `FEE_BPS` in sync with the backend `PERFORMANCE_FEE_BPS`** (`backend/src/tools/fee.ts`, default
 * 100 = 1%). In real mode the backend also sends `netApy`/`feeBps` on `/rates` + `/holdings`; because the
 * fee is uniform, this local computation matches it exactly, so the UI reads consistently in both modes.
 */

/** Performance fee in basis points (100 = 1%). Mirror of the backend default. */
export const FEE_BPS = 100;

/** Human label for the fee, e.g. "1%". */
export const feeLabel = `${FEE_BPS / 100}%`;

/** Net APY a depositor keeps after the performance fee, rounded to 2dp (matches the backend's `netApy`). */
export function netApyOf(grossApy: number, feeBps: number = FEE_BPS): number {
  return Math.round(grossApy * (1 - feeBps / 10_000) * 100) / 100;
}
