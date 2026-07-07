import type { Currency } from "@sorosense/vault-client";
import { UNIT } from "./units";

export type StablecoinSym = "USDC" | "EURC" | "CETES";
export interface Stablecoin { sym: StablecoinSym; currency: Currency; chains: string[]; }
export interface BucketMeta { currency: Currency; name: string; venue: string; tags: string[]; apy: number; }
export interface ActivityItem {
  id: number; cat: "you" | "auto"; kind: string; detail: string; when: string; flag?: boolean; review?: boolean;
}

/** Fundable stablecoins only — no explore/RWA catalog (R19). */
export const STABLECOINS: readonly Stablecoin[] = [
  { sym: "USDC", currency: "USD", chains: ["Stellar"] },
  { sym: "EURC", currency: "EUR", chains: ["Stellar"] },
  { sym: "CETES", currency: "MXN", chains: ["Stellar", "Solana"] },
];

export function stablecoinBySym(sym: string): Stablecoin | undefined {
  return STABLECOINS.find((s) => s.sym === sym.toUpperCase());
}

/** Venue/APY/tags per bucket — figures mirror backend catalog (getCatalog). No risk field. */
const BUCKET_META: Record<Currency, BucketMeta> = {
  USD: { currency: "USD", name: "USD bucket", venue: "DeFindex", tags: ["DeFindex", "Vault"], apy: 8.59 },
  EUR: { currency: "EUR", name: "EUR bucket", venue: "Blend", tags: ["Blend", "Fixed pool"], apy: 5.1 },
  MXN: { currency: "MXN", name: "MXN bucket", venue: "Etherfuse", tags: ["Etherfuse", "CETES"], apy: 5.57 },
};
export function getBucketMeta(currency: Currency): BucketMeta {
  return BUCKET_META[currency];
}

/** Agent + user activity feed — detail strings mirror ActivityEntry.detail (no risk label). */
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

/** Display-only FX to USD for the blended "All buckets" total (never a fund conversion). */
export function getFxRateToUsd(currency: Currency): number {
  return { USD: 1, EUR: 1.08, MXN: 0.055 }[currency];
}

/** Fixture wallet balances (base units) backing the deposit % quick-fill; real read deferred. */
export function getWalletBalance(sym: StablecoinSym): bigint {
  return { USDC: 9076n, EURC: 4200n, CETES: 15000n }[sym] * UNIT;
}
