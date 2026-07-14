import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PERIOD_DAYS, simulate, simulateCurve } from "../simulate";

/** The USD/EUR fixture rates (`BUCKET_META`), passed IN by the caller — the module no longer looks them up. */
const USD_APY = 8.59;
const EUR_APY = 5.1;

test("projects one year of USD at the rate it is given, matching backend simulate()", () => {
  // 1000 * ((1.0859)^1 − 1) = 85.90
  const r = simulate({ currency: "USD", amount: 1000, periodDays: PERIOD_DAYS.year, apy: USD_APY });
  expect(r.apy).toBe(8.59);
  expect(r.projectedEarnings).toBe(85.9);
  expect(r.currency).toBe("USD");
  expect(r.periodDays).toBe(365);
});

test("the rate is an input, not a lookup — a backend APY no fixture carries flows through", () => {
  // 8.2% is what `GET /holdings` reports for a funded USD bucket; BUCKET_META says 8.59.
  const r = simulate({ currency: "USD", amount: 1000, periodDays: PERIOD_DAYS.year, apy: 8.2 });
  expect(r.apy).toBe(8.2);
  expect(r.projectedEarnings).toBe(82);
  expect(r.projectedEarnings).not.toBe(85.9); // it did NOT fall back to the fixture
});

test("the module is pure: it reaches for no fixture at all (one swappable APY source, R5)", () => {
  const source = readFileSync(resolve(process.cwd(), "lib/earn/simulate.ts"), "utf8");
  expect(source).not.toMatch(/getBucketMeta|vault\/data/);
});

test("exposes no poolId — the user picks a currency, the agent picks the pool", () => {
  expect(simulate({ currency: "EUR", amount: 1000, periodDays: 30, apy: EUR_APY })).not.toHaveProperty("poolId");
});

test("a zero-day horizon earns nothing", () => {
  expect(simulate({ currency: "MXN", amount: 5000, periodDays: 0, apy: 5.57 }).projectedEarnings).toBe(0);
});

test("negative input throws, like the backend", () => {
  expect(() => simulate({ currency: "USD", amount: -1, periodDays: 30, apy: USD_APY })).toThrow(/non-negative/);
  expect(() => simulate({ currency: "USD", amount: 1, periodDays: -30, apy: USD_APY })).toThrow(/non-negative/);
});

test("the curve rises monotonically and ends at the projected earnings", () => {
  const curve = simulateCurve({ currency: "USD", amount: 1000, periodDays: 365, apy: USD_APY });
  expect(curve).toHaveLength(20);
  for (let i = 1; i < curve.length; i++) expect(curve[i]!).toBeGreaterThan(curve[i - 1]!);
  expect(curve[19]!).toBeCloseTo(85.9, 2);
});

test("PERIOD_DAYS mirrors the backend table", () => {
  expect(PERIOD_DAYS).toEqual({ day: 1, week: 7, month: 30, year: 365 });
});
