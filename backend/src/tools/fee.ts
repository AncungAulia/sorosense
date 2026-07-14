/**
 * Protocol performance fee — a percentage of the **yield** (never the principal), the standard vault
 * model (Yearn ~20%, Beefy ~9.5%). SoroSense takes {@link DEFAULT_PERFORMANCE_FEE_BPS} (10%) by
 * default, so a 10.57% gross pool APY nets the depositor ~9.51%. Configurable via `PERFORMANCE_FEE_BPS`.
 *
 * Pure math, no I/O — the single source both read surfaces use so the "net APY" they quote never drifts
 * from the "fee on earnings" they book. **Scope note:** this is the fee *model* the app discloses; the
 * on-chain *collection* (sweeping the fee to a treasury address) is a separate keeper/contract step and
 * is intentionally not implied by these numbers being shown — they are the honest net a depositor keeps.
 */

/** Default performance fee: 10% of yield (1000 bps). Must be a share of yield, never of principal. */
export const DEFAULT_PERFORMANCE_FEE_BPS = 1000;

/** Basis-points denominator (100% = 10_000 bps). */
const BPS = 10_000;

/**
 * The configured performance fee in bps, clamped to a sane 0..100% (a fee above 100% of yield is a
 * config error, not a policy). Reads `PERFORMANCE_FEE_BPS` at call time so a late `.env` load still
 * takes effect; unset/garbage → the default.
 */
export function performanceFeeBps(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.PERFORMANCE_FEE_BPS;
  if (!raw) return DEFAULT_PERFORMANCE_FEE_BPS;
  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= BPS ? parsed : DEFAULT_PERFORMANCE_FEE_BPS;
}

/**
 * Net APY a depositor keeps after the performance fee: `gross × (1 − feeBps/10000)`. Because the fee is
 * a share of *yield*, applying it to the APY (which already is a yield rate) is exact. Rounded to 2
 * decimals so the surface quotes a clean percent (e.g. `10.57 → 9.51`).
 */
export function netApy(grossApy: number, feeBps: number = performanceFeeBps()): number {
  const net = grossApy * (1 - feeBps / BPS);
  return Math.round(net * 100) / 100;
}

/** The fee taken from a realized `yieldAmount` (same units in, same units out). Never touches principal. */
export function feeOnYield(yieldAmount: number, feeBps: number = performanceFeeBps()): number {
  return (yieldAmount * feeBps) / BPS;
}

/** The yield a depositor keeps after the fee (`yieldAmount − feeOnYield`). */
export function netYield(yieldAmount: number, feeBps: number = performanceFeeBps()): number {
  return yieldAmount - feeOnYield(yieldAmount, feeBps);
}
