import { MockVaultClient, mockSigner, type Currency } from "@sorosense/vault-client";
import { UNIT } from "./units";

/** Stable pool ids per currency for the seeded funded state. */
export const SEED_POOLS: Record<Currency, string> = {
  USD: "pool-defindex-usd",
  EUR: "pool-blend-eur",
  MXN: "pool-etherfuse-mxn",
};

/**
 * Dev-only: put the mock vault into a realistic funded state under `address` so Home is not empty,
 * withdraw has ≥2 buckets, and the EUR pool is paused (amber note + banner). Idempotent. Replaced
 * by real reads at integration (U20). Deliberately does NOT grant policy consent — `deposit`/
 * `allocate`/`withdraw` don't require it in the mock, and leaving consent ungranted lets the
 * seeded user's first deposit demonstrate the one-time consent flow live (KTD3).
 */
export async function seedVault(client: MockVaultClient, address: string): Promise<void> {
  if ((await client.balanceOf(address, "USD")) > 0n) return;
  const dep = mockSigner("depositor", address);
  const keep = mockSigner("keeper");
  await client.deposit(address, "USD", 1024n * UNIT + 3_000_000n).signAndSubmit(dep); // 1024.30
  await client.deposit(address, "EUR", 920n * UNIT + 1_000_000n).signAndSubmit(dep);  // 920.10
  await client.allocate(SEED_POOLS.USD, "USD", 1024n * UNIT).signAndSubmit(keep);
  await client.allocate(SEED_POOLS.EUR, "EUR", 920n * UNIT).signAndSubmit(keep);
  client.simulateYield("USD", 92n * UNIT);  // ~ +$92 earned
  client.simulateYield("EUR", 84n * UNIT);
  await client.freeze(SEED_POOLS.EUR).signAndSubmit(keep);
}
