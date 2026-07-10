import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { buildEarningsFixture } from "../../../lib/earnings/fixtures";
import { GrowthCard, windowBars } from "../GrowthCard";

const NOW = Date.UTC(2026, 6, 10, 12, 0, 0);
const fixture = buildEarningsFixture(NOW);
const chart = fixture.chart.map((p) => ({ ts: p.ts, earnedUsd: p.earnedUsd * 180 }));
const monthly = fixture.monthly.map((m) => ({ label: m.label, earnedUsd: m.earnedUsd * 180 }));

test("windowBars returns the documented bar count per period", () => {
  expect(windowBars(chart, "day", NOW)).toHaveLength(24);
  expect(windowBars(chart, "week", NOW)).toHaveLength(7);
  expect(windowBars(chart, "month", NOW)).toHaveLength(20);
  expect(windowBars(chart, "year", NOW)).toHaveLength(20);
});

test("bars are per-interval earnings, so they sum to the earnings inside the window", () => {
  const bars = windowBars(chart, "week", NOW);
  const weekAgo = NOW - 7 * 24 * 3_600_000;
  const before = chart.filter((p) => p.ts <= weekAgo).at(-1)!;
  const last = chart.at(-1)!;
  expect(bars.reduce((s, v) => s + v, 0)).toBeCloseTo(last.earnedUsd - before.earnedUsd, 6);
});

test("every bar is non-negative — cumulative earned never goes backwards", () => {
  for (const p of ["day", "week", "month", "year"] as const) {
    for (const v of windowBars(chart, p, NOW)) expect(v).toBeGreaterThanOrEqual(0);
  }
});

test("a window wider than the data clamps instead of inventing points", () => {
  const short = chart.slice(-3);
  expect(windowBars(short, "year", NOW)).toHaveLength(20);
  expect(windowBars(short, "year", NOW).reduce((s, v) => s + v, 0)).toBeCloseTo(
    short.at(-1)!.earnedUsd - short[0]!.earnedUsd,
    6,
  );
});

test("switching period redraws the chart", async () => {
  const user = userEvent.setup();
  render(<GrowthCard chart={chart} monthly={monthly} now={NOW} />);
  expect(screen.getAllByTestId("bar")).toHaveLength(20); // default: year
  await user.click(screen.getByRole("button", { name: "Day" }));
  expect(screen.getAllByTestId("bar")).toHaveLength(24);
  expect(screen.getByRole("button", { name: "Day" })).toHaveAttribute("aria-pressed", "true");
});

test("renders the monthly breakdown beneath the chart", () => {
  render(<GrowthCard chart={chart} monthly={monthly} now={NOW} />);
  expect(screen.getByText("Growth")).toBeInTheDocument();
  expect(screen.getAllByTestId("month-row")).toHaveLength(3);
});
