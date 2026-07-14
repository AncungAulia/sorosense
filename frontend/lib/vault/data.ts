import type { Currency } from "@sorosense/vault-client";
import { UNIT } from "./units";

export type StablecoinSym = "USDC" | "EURC" | "CETES";
export interface Stablecoin { sym: StablecoinSym; currency: Currency; chains: string[]; }
export interface BucketMeta { currency: Currency; name: string; venue: string; tags: string[]; apy: number; }
export interface ActivityItem {
  id: number; cat: "you" | "auto"; kind: string; detail: string; when: string; flag?: boolean; review?: boolean;
}

/**
 * Fundable stablecoins only — no explore/RWA catalog (R19).
 *
 * **OFFLINE FALLBACK (R7 · R11).** The source of truth is the backend's `GET /funding`, reached through
 * `useFunding`, which every Add-funds surface reads. This list renders when `NEXT_PUBLIC_API_URL` is
 * unset (vitest, Playwright, a bare `pnpm dev`) or the read failed. Do not import it into a component —
 * a surface that reads it directly is one the backend can no longer correct.
 */
export const STABLECOINS: readonly Stablecoin[] = [
  { sym: "USDC", currency: "USD", chains: ["Stellar"] },
  { sym: "EURC", currency: "EUR", chains: ["Stellar"] },
  { sym: "CETES", currency: "MXN", chains: ["Stellar", "Solana"] },
];

export function stablecoinBySym(sym: string): Stablecoin | undefined {
  return STABLECOINS.find((s) => s.sym === sym.toUpperCase());
}

/**
 * The stablecoin that funds a bucket — how the faucet's `currency` maps back to a classic asset.
 *
 * Stays a local map in **both** modes on purpose: it is what `FaucetButton` needs to decide whether a
 * currency is mintable at all, before any read has landed, and the faucet is testnet-only plumbing
 * rather than a user-facing list.
 */
export function stablecoinByCurrency(currency: Currency): Stablecoin | undefined {
  return STABLECOINS.find((s) => s.currency === currency);
}

/**
 * Venue/name/tags/APY per bucket — figures mirror the backend catalog (`getCatalog`). No risk field.
 *
 * **OFFLINE FALLBACK (R5 · R11 · KTD4).** In real mode the whole bucket row — name, venue, tags **and**
 * APY — comes from `GET /holdings` (`useBuckets`), so none of this is read. It renders when
 * `NEXT_PUBLIC_API_URL` is unset or the read failed, and — via `useApy` — for a bucket the user has not
 * funded, which `getHoldings` correctly omits (the Earn empty-state hero, the simulator). Reach it only
 * through `useBuckets` / `useApy`; a surface that reads it directly cannot be corrected by the backend.
 */
const BUCKET_META: Record<Currency, BucketMeta> = {
  USD: { currency: "USD", name: "USD bucket", venue: "DeFindex", tags: ["DeFindex", "Vault"], apy: 8.59 },
  EUR: { currency: "EUR", name: "EUR bucket", venue: "Blend", tags: ["Blend", "Fixed pool"], apy: 5.1 },
  MXN: { currency: "MXN", name: "MXN bucket", venue: "Etherfuse", tags: ["Etherfuse", "CETES"], apy: 5.57 },
};
export function getBucketMeta(currency: Currency): BucketMeta {
  return BUCKET_META[currency];
}

/** Display data for a safe-exit *target* pool, keyed by pool id. No risk field (invisible safety). */
const POOL_META: Record<string, { name: string; apy: number }> = {
  "pool-defindex-eur": { name: "DeFindex EURC", apy: 5.9 },
};

/** Name + APY to render an exit proposal's target pool; null for pools with no display entry. */
export function getPoolMeta(poolId: string): { name: string; apy: number } | null {
  return POOL_META[poolId] ?? null;
}

/**
 * Agent + user activity feed — detail strings mirror ActivityEntry.detail (no risk label).
 *
 * **OFFLINE FALLBACK (R6 · R11).** The source of truth is `GET /activity`, reached through
 * `useActivity`, which merges the agent's log with the user's decoded on-chain actions. These eight
 * rows render when `NEXT_PUBLIC_API_URL` is unset, when no wallet is connected, or when the read
 * failed — the Playwright baseline and the offline demo depend on them, which is why they survive.
 */
export function getActivity(): ActivityItem[] {
  return [
    { id: 8, cat: "auto", kind: "rebalanced", detail: "Switched to DeFindex · 8.59% APY", when: "3h ago" },
    { id: 7, cat: "auto", kind: "compounded", detail: "Reinvested rewards +$0.31 into USD pool", when: "5h ago" },
    { id: 6, cat: "auto", kind: "froze", detail: "Paused EURC pool for safety", when: "6h ago", flag: true },
    { id: 5, cat: "auto", kind: "proposed-exit", detail: "Proposed safe exit from EURC pool", when: "6h ago", review: true },
    { id: 4, cat: "you", kind: "withdrew", detail: "Moved $500 to your wallet", when: "1d ago" },
    { id: 3, cat: "you", kind: "deposited", detail: "Deposited 1,000 USDC to USD bucket", when: "2d ago" },
    { id: 2, cat: "you", kind: "consented", detail: "Signed auto-optimize mandate", when: "2d ago" },
    { id: 1, cat: "auto", kind: "allocated", detail: "Allocated to Blend USDC", when: "2d ago" },
  ];
}

/**
 * Display-only FX to USD for the blended "All buckets" total (never a fund conversion).
 *
 * **OFFLINE FALLBACK (R5 · R11 · KTD5).** These are constants, and a constant is not an exchange rate.
 * In real mode the blended USD arrives pre-computed on `GET /holdings` (`valueUsd`) and `GET /earnings`,
 * where the backend blended it with a **live Reflector oracle read** — that is the number the user sees.
 * This renders only when the API is off or the read failed, and the day the seam is offline-only it
 * goes away with it.
 */
export function getFxRateToUsd(currency: Currency): number {
  return { USD: 1, EUR: 1.08, MXN: 0.055 }[currency];
}

/**
 * Fixture wallet balances (base units) backing the deposit % quick-fill — the **mock path only** (R6).
 *
 * The real balance is a Horizon trustline read (`lib/wallet/balance.ts`), reached through
 * `useWalletBalance`. This stays as the offline fallback: with `NEXT_PUBLIC_STELLAR_HORIZON_URL` /
 * the issuer vars unset (vitest, Playwright, a bare `pnpm dev`) no request is issued and these numbers
 * render. Nothing outside `useWalletBalance` should call it.
 */
export function getFixtureWalletBalance(sym: StablecoinSym): bigint {
  return { USDC: 9076n, EURC: 4200n, CETES: 15000n }[sym] * UNIT;
}
