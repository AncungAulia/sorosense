import { buildEarningsFixture } from "../fixtures";

// 2026-07-10T12:00:00Z — a fixed epoch, so the fixture is deterministic in tests.
const NOW = Date.UTC(2026, 6, 10, 12, 0, 0);

test("is deterministic for a given `now`", () => {
  expect(buildEarningsFixture(NOW)).toEqual(buildEarningsFixture(NOW));
});

test("monthly has 9 entries, oldest→newest, labelled YYYY-MM", () => {
  const { monthly } = buildEarningsFixture(NOW);
  expect(monthly).toHaveLength(9);
  expect(monthly.map((m) => m.label)).toEqual([
    "2025-11", "2025-12", "2026-01", "2026-02", "2026-03",
    "2026-04", "2026-05", "2026-06", "2026-07",
  ]);
});

test("monthly weights are normalized — they sum to 1", () => {
  const { monthly } = buildEarningsFixture(NOW);
  expect(monthly.reduce((s, m) => s + m.earnedUsd, 0)).toBeCloseTo(1, 10);
});

test("chart is monotonically non-decreasing and ends exactly at `now` with 1", () => {
  const { chart } = buildEarningsFixture(NOW);
  const last = chart[chart.length - 1]!;
  expect(last.ts).toBe(NOW);
  expect(last.earnedUsd).toBeCloseTo(1, 10);
  for (let i = 1; i < chart.length; i++) {
    expect(chart[i]!.earnedUsd).toBeGreaterThanOrEqual(chart[i - 1]!.earnedUsd);
    expect(chart[i]!.ts).toBeGreaterThan(chart[i - 1]!.ts);
  }
});

test("chart resolution is hourly over the last 7 days and daily before that", () => {
  const { chart } = buildEarningsFixture(NOW);
  const HOUR = 3_600_000;
  const weekAgo = NOW - 7 * 24 * HOUR;
  const recent = chart.filter((p) => p.ts >= weekAgo);
  // 7 days of hourly points, inclusive of both ends.
  expect(recent.length).toBeGreaterThanOrEqual(7 * 24);
  const older = chart.filter((p) => p.ts < weekAgo);
  expect(older.length).toBeGreaterThan(200); // ~8 months of daily points
  expect(older[1]!.ts - older[0]!.ts).toBe(24 * HOUR);
});

test("the chart's last point equals the sum of monthly — one earned figure, two views", () => {
  const { chart, monthly } = buildEarningsFixture(NOW);
  expect(chart[chart.length - 1]!.earnedUsd).toBeCloseTo(
    monthly.reduce((s, m) => s + m.earnedUsd, 0),
    10,
  );
});
