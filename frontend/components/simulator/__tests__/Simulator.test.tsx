import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import type { Currency } from "@sorosense/vault-client";
import { Simulator } from "../Simulator";

function Harness() {
  const [currency, setCurrency] = useState<Currency>("USD");
  return <Simulator currency={currency} onCurrencyChange={setCurrency} />;
}

test("projects a year of USD by default", () => {
  render(<Harness />);
  expect(screen.getByTestId("projection").textContent).toBe("$85.90"); // 1000 @ 8.59%
});

test("stepping the amount re-projects", async () => {
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(screen.getByRole("button", { name: "Increase" }));
  expect(screen.getByTestId("amount").textContent).toBe("$1,500");
  expect(screen.getByTestId("projection").textContent).toBe("$128.85");
});

test("the amount clamps at 500 and never goes to zero", async () => {
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(screen.getByRole("button", { name: "Decrease" }));
  await user.click(screen.getByRole("button", { name: "Decrease" }));
  expect(screen.getByTestId("amount").textContent).toBe("$500");
});

test("switching currency changes the symbol and the projection", async () => {
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(screen.getByRole("button", { name: "EUR" }));
  expect(screen.getByTestId("amount").textContent).toBe("€1,000");
  expect(screen.getByTestId("projection").textContent).toBe("€51.00"); // 1000 @ 5.10%
});

test("switching period changes the projection", async () => {
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(screen.getByRole("button", { name: "Month" }));
  expect(screen.getByRole("button", { name: "Month" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByTestId("projection").textContent).toBe("$6.80"); // 1000 @ 8.59%, 30d
});

test("the chart gets denser as the horizon grows — fewest bars on Day, most on Year", async () => {
  const user = userEvent.setup();
  const barCount = () => screen.getAllByTestId("bar").length;
  render(<Harness />);
  expect(barCount()).toBe(20); // year, the default

  await user.click(screen.getByRole("button", { name: "Day" }));
  expect(barCount()).toBe(4);
  expect(screen.getByTestId("projection").textContent).toBe("$0.23");

  await user.click(screen.getByRole("button", { name: "Week" }));
  expect(barCount()).toBe(7); // one bar per day

  await user.click(screen.getByRole("button", { name: "Month" }));
  expect(barCount()).toBe(12);
});

test("bars redraw when the curve's shape changes — the chart is not an ornament", async () => {
  const user = userEvent.setup();
  const heights = () => screen.getAllByTestId("bar").map((b) => b.style.height);
  render(<Harness />);
  const usdYear = heights();

  // Compare at a FIXED period, so the bar count is equal and only the curve's shape can differ.
  // `(1 + apy/100)^(t/365)` bends differently at a different APY, and <Bars> normalizes against the
  // series maximum, so that curvature survives normalization and the bars really do redraw.
  await user.click(screen.getByRole("button", { name: "EUR" }));
  const eurYear = heights();
  expect(eurYear).toHaveLength(usdYear.length);
  expect(eurYear).not.toEqual(usdYear);
});

test("R11 — no pool selector, no risk label anywhere", () => {
  const { container } = render(<Harness />);
  expect(container.textContent).not.toMatch(/safe|watch|risk|score|pool/i);
});
