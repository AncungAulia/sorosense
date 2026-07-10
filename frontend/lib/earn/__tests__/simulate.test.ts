import { PERIOD_DAYS, simulate, simulateCurve } from "../simulate";

test("projects one year of USD at the bucket APY, matching backend simulate()", () => {
  // getBucketMeta("USD").apy === 8.59 → 1000 * ((1.0859)^1 − 1) = 85.90
  const r = simulate({ currency: "USD", amount: 1000, periodDays: PERIOD_DAYS.year });
  expect(r.apy).toBe(8.59);
  expect(r.projectedEarnings).toBe(85.9);
  expect(r.currency).toBe("USD");
  expect(r.periodDays).toBe(365);
});

test("exposes no poolId — the user picks a currency, the agent picks the pool", () => {
  expect(simulate({ currency: "EUR", amount: 1000, periodDays: 30 })).not.toHaveProperty("poolId");
});

test("a zero-day horizon earns nothing", () => {
  expect(simulate({ currency: "MXN", amount: 5000, periodDays: 0 }).projectedEarnings).toBe(0);
});

test("negative input throws, like the backend", () => {
  expect(() => simulate({ currency: "USD", amount: -1, periodDays: 30 })).toThrow(/non-negative/);
  expect(() => simulate({ currency: "USD", amount: 1, periodDays: -30 })).toThrow(/non-negative/);
});

test("the curve rises monotonically and ends at the projected earnings", () => {
  const curve = simulateCurve({ currency: "USD", amount: 1000, periodDays: 365 });
  expect(curve).toHaveLength(20);
  for (let i = 1; i < curve.length; i++) expect(curve[i]!).toBeGreaterThan(curve[i - 1]!);
  expect(curve[19]!).toBeCloseTo(85.9, 2);
});

test("PERIOD_DAYS mirrors the backend table", () => {
  expect(PERIOD_DAYS).toEqual({ day: 1, week: 7, month: 30, year: 365 });
});
