import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MonthlyBreakdown, formatMonthLabel } from "../MonthlyBreakdown";

const NOW = Date.UTC(2026, 6, 10); // 2026-07

const monthly = [
  "2025-11", "2025-12", "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07",
].map((label, i) => ({ label, earnedUsd: 10 + i }));

test("formatMonthLabel distinguishes this month, this year, and last year", () => {
  expect(formatMonthLabel("2026-07", NOW)).toBe("This month");
  expect(formatMonthLabel("2026-06", NOW)).toBe("June");
  expect(formatMonthLabel("2025-11", NOW)).toBe("November 2025");
});

test("shows 3 rows newest-first, then loads 3 more per click until exhausted", async () => {
  const user = userEvent.setup();
  render(<MonthlyBreakdown monthly={monthly} now={NOW} />);

  expect(screen.getAllByTestId("month-row")).toHaveLength(3);
  expect(screen.getAllByTestId("month-row")[0]!.textContent).toContain("This month");
  expect(screen.getAllByTestId("month-row")[1]!.textContent).toContain("June");

  await user.click(screen.getByRole("button", { name: /Load more/ }));
  expect(screen.getAllByTestId("month-row")).toHaveLength(6);

  await user.click(screen.getByRole("button", { name: /Load more/ }));
  expect(screen.getAllByTestId("month-row")).toHaveLength(9);
  expect(screen.queryByRole("button", { name: /Load more/ })).not.toBeInTheDocument();
});

test("earned is rendered as a signed USD amount", () => {
  render(<MonthlyBreakdown monthly={monthly} now={NOW} />);
  expect(screen.getAllByTestId("month-row")[0]!.textContent).toContain("+$18.00");
});

test("no Load more when everything already fits", () => {
  render(<MonthlyBreakdown monthly={monthly.slice(-2)} now={NOW} />);
  expect(screen.getAllByTestId("month-row")).toHaveLength(2);
  expect(screen.queryByRole("button", { name: /Load more/ })).not.toBeInTheDocument();
});

test("a negative month renders as a loss, not a gain", () => {
  const withLoss = [...monthly.slice(0, -1), { label: "2026-07", earnedUsd: -12.5 }];
  render(<MonthlyBreakdown monthly={withLoss} now={NOW} />);
  const first = screen.getAllByTestId("month-row")[0]!;
  expect(first.textContent).toContain("−$12.50");
  expect(first.textContent).not.toContain("+");
  expect(first.querySelector("span:last-child")).toHaveClass("text-neg");
});

/**
 * A month that earned nothing is neither a gain nor a loss, and must not be dressed as one — a green
 * "+$0.00" claims growth that did not happen, which is the class of lie U3 removes (R10). Zero is the
 * live vault's honest state until NAV accrual ships.
 */
test("a zero month is neutral — no plus sign, no green", () => {
  const withZero = [...monthly.slice(0, -1), { label: "2026-07", earnedUsd: 0 }];
  render(<MonthlyBreakdown monthly={withZero} now={NOW} />);
  const first = screen.getAllByTestId("month-row")[0]!;
  expect(first.textContent).toContain("$0.00");
  expect(first.textContent).not.toContain("+");
  expect(first.querySelector("span:last-child")).toHaveClass("text-muted");
  expect(first.querySelector("span:last-child")).not.toHaveClass("text-pos");
});

test("an empty month list renders nothing at all — not an empty rule", () => {
  const { container } = render(<MonthlyBreakdown monthly={[]} now={NOW} />);
  expect(container).toBeEmptyDOMElement();
  expect(screen.queryAllByTestId("month-row")).toHaveLength(0);
});
