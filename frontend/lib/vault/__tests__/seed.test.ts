import { MockVaultClient } from "@sorosense/vault-client";
import { seedVault, SEED_POOLS } from "../seed";

test("seed funds two buckets, freezes EUR, and is idempotent", async () => {
  const c = new MockVaultClient();
  await seedVault(c, "GUSER");
  expect(await c.balanceOf("GUSER", "USD")).toBeGreaterThan(0n);
  expect(await c.balanceOf("GUSER", "EUR")).toBeGreaterThan(0n);
  expect(await c.balanceOf("GUSER", "MXN")).toBe(0n);
  expect(await c.poolStatus(SEED_POOLS.EUR)).toBe("frozen");
  expect(await c.poolStatus(SEED_POOLS.USD)).toBe("active");
  expect(await c.hasConsent("GUSER")).toBe(true);

  const usd = await c.balanceOf("GUSER", "USD");
  await seedVault(c, "GUSER"); // second run is a no-op
  expect(await c.balanceOf("GUSER", "USD")).toBe(usd);
});
