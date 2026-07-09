import { MockVaultClient } from "@sorosense/vault-client";
import { seedVault, SEED_POOLS } from "../seed";
import { SEED_SAFE_EXIT } from "../seed";

test("seed funds two buckets, freezes EUR, and is idempotent", async () => {
  const c = new MockVaultClient();
  await seedVault(c, "GUSER");
  expect(await c.balanceOf("GUSER", "USD")).toBeGreaterThan(0n);
  expect(await c.balanceOf("GUSER", "EUR")).toBeGreaterThan(0n);
  expect(await c.balanceOf("GUSER", "MXN")).toBe(0n);
  expect(await c.poolStatus(SEED_POOLS.EUR)).toBe("frozen");
  expect(await c.poolStatus(SEED_POOLS.USD)).toBe("active");
  expect(await c.hasConsent("GUSER")).toBe(false);

  const usd = await c.balanceOf("GUSER", "USD");
  await seedVault(c, "GUSER"); // second run is a no-op
  expect(await c.balanceOf("GUSER", "USD")).toBe(usd);
});

test("seed proposes a safe exit for the frozen EUR pool (drives banner + sheet)", async () => {
  const c = new MockVaultClient();
  await seedVault(c, "GUSER");
  const exit = await c.pendingExit("EUR");
  expect(exit).not.toBeNull();
  expect(exit?.fromPool).toBe(SEED_POOLS.EUR);
  expect(exit?.toPool).toBe(SEED_SAFE_EXIT.EUR);
  expect(await c.pendingExit("USD")).toBeNull(); // active pool → no exit
});
