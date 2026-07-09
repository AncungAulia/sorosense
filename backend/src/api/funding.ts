/**
 * Add-funds read API (R19) — the backend source of truth for the frontend's currently-hardcoded
 * `STABLECOINS` (`frontend/lib/vault/data.ts`). Lists the fundable stablecoins plus the RWA options
 * a user may add funds into. Deposit-time only: no explore/hub catalog, no trap venues (getCatalog
 * already excludes them), and no risk/label/score anywhere (safety is invisible, R11).
 *
 * RWA options deliberately OMIT `apy` (AE5): they are fixed-yield instruments whose rate is shown at
 * the deposit step, not in this list. Pure and deterministic — reads the vetted catalog only, no
 * seam, no FX, no network.
 */

import type { Currency } from '@sorosense/vault-client';
import { getCatalog } from '../tools/catalog.js';

export type StablecoinSym = 'USDC' | 'EURC' | 'CETES';

/** A fundable stablecoin and the chains it can be deposited from. */
export interface Stablecoin {
  sym: StablecoinSym;
  currency: Currency;
  chains: string[];
}

/** A fundable RWA option. No `apy` — fixed-yield; the rate appears at the deposit step (AE5). */
export interface RwaOption {
  id: string;
  name: string;
  venue: string;
  currency: Currency;
}

export interface FundingOptions {
  stablecoins: Stablecoin[];
  rwa: RwaOption[];
}

/**
 * The fundable stablecoins (backend owns this now, mirroring the frontend `STABLECOINS`). Fixed
 * list — no explore/RWA catalog here.
 */
const STABLECOINS: readonly Stablecoin[] = [
  { sym: 'USDC', currency: 'USD', chains: ['Stellar'] },
  { sym: 'EURC', currency: 'EUR', chains: ['Stellar'] },
  { sym: 'CETES', currency: 'MXN', chains: ['Stellar', 'Solana'] },
];

/**
 * The Add-funds list: fundable stablecoins plus the vetted RWA options. RWA entries are derived from
 * the vetted catalog (traps already excluded) and carry NO apy field.
 */
export function getFundingOptions(): FundingOptions {
  const rwa: RwaOption[] = getCatalog()
    .filter((v) => v.kind === 'rwa')
    .map((v) => ({ id: v.id, name: v.name, venue: v.venue, currency: v.currency }));
  return { stablecoins: STABLECOINS.map((s) => ({ ...s, chains: [...s.chains] })), rwa };
}
