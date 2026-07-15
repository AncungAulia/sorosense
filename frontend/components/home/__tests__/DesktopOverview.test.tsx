/**
 * The desktop Overview's value-over-time chart (R9).
 *
 * What this file exists to prove: **the fabricated series is gone.** The chart used to be three summed
 * sine waves anchored to the current total, drawn identically whether the user had moved money that week
 * or not. It now plots the backend's own `valueUsd` timeline: a step function on real deposits and
 * withdrawals, flat in between.
 *
 * `rangeSeries` is exported and tested directly because the fabrication was arithmetic, not markup: a
 * render assertion ("a chart appeared") passed just as happily with the wobble in place.
 *
 * The suite runs with `NEXT_PUBLIC_API_URL` absent, so the rendered component here is the **offline**
 * one — the fixture path. That is deliberate: the deletion has to hold in both modes, and the offline
 * timeline is the one Playwright's baseline renders.
 */
import { render, screen, waitFor } from "@testing-library/react";
import { MockVaultClient } from "@sorosense/vault-client";
import { VaultProvider } from "../../../providers/VaultProvider";
import { ToastProvider } from "../../../providers/ToastProvider";
import { seedVault } from "../../../lib/vault/seed";
import type { ChartPoint } from "../../../hooks/useEarnings";
import { DesktopOverview, rangeSeries } from "../DesktopOverview";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/home",
  useSearchParams: () => new URLSearchParams(""),
}));
const useWallet = vi.fn();
vi.mock("../../../hooks/useWallet", () => ({ useWallet: () => useWallet() }));

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NOW = Date.UTC(2026, 6, 10, 12, 0, 0);

const point = (ts: number, valueUsd: number): ChartPoint => ({ ts, valueUsd, earnedUsd: 0 });

test("the series is the backend's value timeline — a step up, with nothing invented between", () => {
  // The plan's own example: a deposit takes the bucket from $1,000 to $1,500.
  const chart = [point(NOW - DAY, 1000), point(NOW, 1500)];
  const series = rangeSeries(chart, "Week", 1500);

  expect(series).toEqual([1000, 1500]);
  // Monotone, and nothing overshoots the real high-water mark. The old synthetic series failed both: its
  // wobble rode ±vol around the trend line, so interior points sat above the final value and the series
  // reversed direction several times — a chart of money that never moved that way.
  for (let i = 1; i < series.length; i++) expect(series[i]!).toBeGreaterThanOrEqual(series[i - 1]!);
  for (const v of series.slice(0, -1)) expect(v).toBeLessThanOrEqual(1500);
  expect(Math.max(...series)).toBe(1500);
});

test("a withdrawal steps the series DOWN — the chart follows the money, not a trend", () => {
  const chart = [point(NOW - 2 * HOUR, 1500), point(NOW - HOUR, 1500), point(NOW, 900)];
  expect(rangeSeries(chart, "Day", 900)).toEqual([1500, 1500, 900]);
});

test("an empty chart renders a flat line at the value we actually hold — never a curve from nothing", () => {
  // A fresh vault, or a server that booted a moment ago. There is no history to draw.
  const series = rangeSeries([], "Week", 2500);
  expect(series).toEqual([2500, 2500]);
  expect(series).toHaveLength(2); // ValueChart needs two points to draw a line at all
});

test("points outside the selected range are excluded", () => {
  const chart = [point(NOW - 20 * DAY, 500), point(NOW - 2 * HOUR, 1000), point(NOW, 1200)];
  // The 20-day-old point is outside Day and Week, inside Month (30d) and Year (all).
  expect(rangeSeries(chart, "Day", 1200)).toEqual([1000, 1200]);
  expect(rangeSeries(chart, "Week", 1200)).toEqual([1000, 1200]);
  expect(rangeSeries(chart, "Month", 1200)).toEqual([500, 1000, 1200]);
  expect(rangeSeries(chart, "Year", 1200)).toEqual([500, 1000, 1200]);
});

test("a range holding no movement still renders — flat at the last known value, not at zero", () => {
  // The only deposit was 20 days ago; the snapshotter has kept stamping the same value since. Over the
  // last Day nothing happened, so the Day chart is a level line at what the bucket holds — not an empty
  // chart, and emphatically not a line falling to $0.
  const chart = [point(NOW - 20 * DAY, 500), point(NOW - 19 * DAY, 1200), point(NOW, 1200)];
  const series = rangeSeries(chart, "Day", 1200);
  expect(series).toEqual([1200, 1200]);
});

test("every value in the series is finite — a NaN would blank the SVG path", () => {
  for (const range of ["Day", "Week", "Month", "Year"] as const) {
    for (const v of rangeSeries([], range, 0)) expect(Number.isFinite(v)).toBe(true);
    for (const v of rangeSeries([point(NOW, 1000)], range, 1000)) expect(Number.isFinite(v)).toBe(true);
  }
});

test("the Overview renders a funded vault without throwing, and draws no wobble", async () => {
  useWallet.mockReturnValue({ address: "GUSER", isConnected: true });
  const client = new MockVaultClient();
  await seedVault(client, "GUSER");
  render(
    <VaultProvider client={client}>
      <ToastProvider>
        <DesktopOverview />
      </ToastProvider>
    </VaultProvider>,
  );

  await waitFor(() => expect(screen.getByText("USD Bucket")).toBeInTheDocument());
  expect(screen.getByLabelText("Your value")).toBeInTheDocument();
  expect(screen.getByLabelText("Range")).toBeInTheDocument();
});

test("an unfunded vault renders the Overview flat — no buckets, no chart, no crash", async () => {
  // No address → no buckets, and `VaultProvider` never runs the dev seed (same idiom as
  // `earn-empty.test.tsx`). Handing it an address instead would have the provider seed the vault out
  // from under the assertions — the empty state would then only render until the seed landed, which is
  // a race, not a test.
  useWallet.mockReturnValue({ address: null, isConnected: false });
  render(
    <VaultProvider client={new MockVaultClient()}>
      <ToastProvider>
        <DesktopOverview />
      </ToastProvider>
    </VaultProvider>,
  );

  await waitFor(() => expect(screen.getByText("No deposits yet")).toBeInTheDocument());
  expect(screen.getByText("Deposit to start earning")).toBeInTheDocument();
  expect(screen.queryByText(/performance fee/i)).toBeNull();
  expect(screen.getByText("Deposit your money to create your first earning bucket.")).toBeInTheDocument();
  expect(screen.getByText("No agent activity yet")).toBeInTheDocument();
  expect(screen.getByText("Deposit first; automated moves will show here.")).toBeInTheDocument();
  // Before the first deposit, Growth offers the same deterministic simulator as the Earn surface.
  expect(screen.getByText("Simulate earnings")).toBeInTheDocument();
  expect(screen.getByText("$1,000")).toBeInTheDocument();
  expect(screen.getByTestId("growth-simulator")).toBeInTheDocument();
});
