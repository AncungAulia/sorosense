/**
 * The desktop Growth card's monthly-earnings bars, and the zero-state that replaces them (R10).
 *
 * Zero earned is the live vault's honest state: `share_price` reads exactly `SHARE_PRICE_SCALE` until
 * mark-to-market NAV accrual ships, so nothing has accrued. A row of minimum-height stubs does not
 * communicate that — it reads as a chart that failed to load. The card says it in words instead.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GrowthChart } from "../GrowthChart";

const EARNED = [
  { label: "2026-05", earnedUsd: 12.5 },
  { label: "2026-06", earnedUsd: 20 },
  { label: "2026-07", earnedUsd: 7.25 },
];
const ZERO = [
  { label: "2026-05", earnedUsd: 0 },
  { label: "2026-06", earnedUsd: 0 },
  { label: "2026-07", earnedUsd: 0 },
];

test("with earnings it draws one bar per month, each labelled with its value", () => {
  render(<GrowthChart monthly={EARNED} />);

  expect(screen.getByTestId("bars")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "June $20.00" })).toBeInTheDocument();
  expect(screen.queryByTestId("growth-zero")).toBeNull();
});

test("an all-zero month list renders the honest zero-state, not three floor-height bars", () => {
  render(<GrowthChart monthly={ZERO} />);

  expect(screen.getByTestId("growth-zero")).toBeInTheDocument();
  expect(screen.getByText("No earnings yet")).toBeInTheDocument();
  expect(screen.queryByTestId("bars")).toBeNull();
});

test("before the first deposit it renders a compact earnings simulator", async () => {
  render(
    <GrowthChart
      monthly={[]}
      hasDeposit={false}
      simulation={{
        currency: "USD",
        setCurrency: vi.fn(),
        amount: 1000,
        period: "year",
        setPeriod: vi.fn(),
        projectedEarnings: 82,
        curve: [10, 20, 30],
        max: 30,
        step: vi.fn(),
      }}
    />,
  );

  expect(screen.getByTestId("growth-simulator")).toBeInTheDocument();
  expect(screen.queryByText("Simulate earnings")).toBeNull();
  expect(screen.getByText("You would earn")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "USDC" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("group", { name: "Simulation period" })).toBeInTheDocument();
  const bar = screen.getByRole("button", { name: "Month 2 $20.00" });
  await userEvent.hover(bar);
  expect(screen.getAllByText((_, el) => el?.textContent === "Month 2 · +$20.00").length).toBeGreaterThan(0);
  expect(screen.queryByTestId("growth-zero")).toBeNull();
});

test("an empty month list renders the zero-state and does not throw", () => {
  render(<GrowthChart monthly={[]} />);
  expect(screen.getByTestId("growth-zero")).toBeInTheDocument();
});

test("no NaN reaches the DOM — the bar heights divide by the series maximum, which is zero here", () => {
  const { container } = render(<GrowthChart monthly={ZERO} />);
  expect(container.innerHTML).not.toContain("NaN");
});
