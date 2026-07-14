import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { buildEarningsFixture } from "../../../lib/earnings/fixtures";
import { GrowthCard, windowBars } from "../GrowthCard";

const NOW = Date.UTC(2026, 6, 10, 12, 0, 0);
// $180 earned on a $1,180 balance — the fixture stretches its normalized curve onto those two figures,
// so `chart`/`monthly` come out in absolute USD, exactly as `useEarnings` builds them offline.
const { chart, monthly } = buildEarningsFixture(NOW, { balanceUsd: 1180, earnedUsd: 180 });

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

test("earnings spread across the bins — no dead first bar, no doubled last one", () => {
  // The fixture is hourly over the trailing week, so `day` puts one interval in each of 24 bins.
  // Binning an interval by the timestamp it ENDS at instead of the one it starts at leaves bin 0
  // empty (the first interval ends inside bin 1) and doubles the last bin (the point stamped exactly
  // at `now` clamps down onto it). Both survive a bar-count check and a sum check, and both are
  // glaring on screen: a dot on the left, a spike on the right.
  const bars = windowBars(chart, "day", NOW);
  expect(bars.filter((v) => v === 0)).toHaveLength(0);

  const last = bars.at(-1)!;
  const secondLast = bars.at(-2)!;
  expect(last).toBeLessThan(secondLast * 1.5);

  // Hourly earnings over one day barely accelerate, so every bar should sit near the mean.
  const mean = bars.reduce((s, v) => s + v, 0) / bars.length;
  for (const v of bars) expect(v).toBeGreaterThan(mean * 0.5);
});

test("a window wider than the data clamps instead of inventing points", () => {
  const short = chart.slice(-3);
  expect(windowBars(short, "year", NOW)).toHaveLength(20);
  expect(windowBars(short, "year", NOW).reduce((s, v) => s + v, 0)).toBeCloseTo(
    short.at(-1)!.earnedUsd - short[0]!.earnedUsd,
    6,
  );
});

test("a finite window clamps to the data instead of reaching before the series begins", () => {
  // A 3-hour chart under the 7-day `week` window: `now - 7d` precedes the first point, so `start`
  // must clamp to `first.ts`. Without the clamp, `span` covers days of nonexistent data and every
  // delta collapses into the final bin.
  const start = NOW - 3 * 3_600_000;
  const short = [
    { ts: start, valueUsd: 1000, earnedUsd: 0 },
    { ts: start + 3_600_000, valueUsd: 1010, earnedUsd: 10 },
    { ts: start + 2 * 3_600_000, valueUsd: 1025, earnedUsd: 25 },
    { ts: NOW, valueUsd: 1040, earnedUsd: 40 },
  ];
  const bars = windowBars(short, "week", NOW);
  expect(bars).toHaveLength(7);
  expect(bars.reduce((s, v) => s + v, 0)).toBeCloseTo(40, 6);
  // The clamp spreads the deltas across the bins rather than dumping them all in the last one.
  expect(bars.filter((v) => v > 0).length).toBeGreaterThan(1);
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

/**
 * The live vault's honest state (R10): a real deposit, a real balance, and zero earned — `share_price`
 * is pinned to `SHARE_PRICE_SCALE` until mark-to-market NAV accrual ships. The card must say so.
 */
describe("zero-state — no earnings yet", () => {
  const zeroChart = [
    { ts: NOW - 86_400_000, valueUsd: 0, earnedUsd: 0 },
    { ts: NOW, valueUsd: 1000, earnedUsd: 0 }, // the deposit stepped value; earned did not move
  ];
  const zeroMonthly = [
    { label: "2026-06", earnedUsd: 0 },
    { label: "2026-07", earnedUsd: 0 },
  ];

  test("an all-zero month list says 'no earnings yet' instead of drawing floor-height bars", () => {
    render(<GrowthCard chart={zeroChart} monthly={zeroMonthly} now={NOW} />);

    expect(screen.getByTestId("growth-zero")).toBeInTheDocument();
    expect(screen.getByText("No earnings yet")).toBeInTheDocument();
    // Bars at the 8px floor are not a chart of zero — they are a chart that looks broken or unloaded.
    expect(screen.queryAllByTestId("bar")).toHaveLength(0);
    // And nine rows of "+$0.00" are noise, not a breakdown.
    expect(screen.queryAllByTestId("month-row")).toHaveLength(0);
  });

  test("a fresh vault — no chart, no months at all — renders the same zero-state, and does not throw", () => {
    render(<GrowthCard chart={[]} monthly={[]} now={0} />);

    expect(screen.getByTestId("growth-zero")).toBeInTheDocument();
    expect(screen.queryAllByTestId("bar")).toHaveLength(0);
  });

  test("no NaN reaches the DOM — an all-zero series would divide by a zero maximum", () => {
    const { container } = render(<GrowthCard chart={zeroChart} monthly={zeroMonthly} now={NOW} />);
    expect(container.innerHTML).not.toContain("NaN");
  });

  test("one cent of earnings is enough to bring the real chart back", () => {
    const some = [{ label: "2026-06", earnedUsd: 0 }, { label: "2026-07", earnedUsd: 0.01 }];
    render(<GrowthCard chart={chart} monthly={some} now={NOW} />);

    expect(screen.queryByTestId("growth-zero")).toBeNull();
    expect(screen.getAllByTestId("bar").length).toBeGreaterThan(0);
  });
});
