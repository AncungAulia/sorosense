import { STABLECOINS, stablecoinBySym, getBucketMeta, getActivity, getFxRateToUsd, getWalletBalance } from "../data";
import { getPoolMeta } from "../data";

test("only fundable stablecoins are listed (R19), one per currency", () => {
  expect(STABLECOINS.map((s) => s.sym)).toEqual(["USDC", "EURC", "CETES"]);
  expect(STABLECOINS.map((s) => s.currency)).toEqual(["USD", "EUR", "MXN"]);
});

test("bucket meta carries venue/apy/tags but no risk field", () => {
  const usd = getBucketMeta("USD");
  expect(usd.name).toBe("USD bucket");
  expect(usd.venue).toBe("DeFindex");
  expect(usd.apy).toBeGreaterThan(0);
  expect(Object.keys(usd)).not.toContain("risk");
  expect(Object.keys(usd)).not.toContain("tier");
});

test("activity has you/auto facets and no risk labels", () => {
  const items = getActivity();
  expect(items.length).toBeGreaterThan(0);
  expect(items.some((a) => a.cat === "you")).toBe(true);
  expect(items.some((a) => a.cat === "auto")).toBe(true);
  for (const a of items) expect(JSON.stringify(a)).not.toMatch(/risk|tier|score/i);
});

test("FX and wallet fixtures are usable", () => {
  expect(getFxRateToUsd("USD")).toBe(1);
  expect(getFxRateToUsd("EUR")).toBeGreaterThan(1);
  expect(getWalletBalance("USDC")).toBeGreaterThan(0n);
  expect(stablecoinBySym("usdc")?.currency).toBe("USD");
});

test("getPoolMeta returns display name + apy for a target pool, null otherwise, no risk field", () => {
  const eur = getPoolMeta("pool-defindex-eur");
  expect(eur).toEqual({ name: "DeFindex EURC", apy: 5.9 });
  expect(getPoolMeta("pool-unknown")).toBeNull();
  expect(JSON.stringify(eur)).not.toMatch(/risk|tier|score/i);
});
