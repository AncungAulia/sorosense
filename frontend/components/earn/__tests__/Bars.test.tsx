import { render, screen } from "@testing-library/react";
import { Bars } from "../Bars";

test("renders one bar per value, tallest at the maximum", () => {
  render(<Bars values={[0, 50, 100]} />);
  const bars = screen.getAllByTestId("bar");
  expect(bars).toHaveLength(3);
  expect(bars[0]!.style.height).toBe("8px");   // floor, so an empty bar is still visible
  expect(bars[2]!.style.height).toBe("112px"); // 8 + 104
});

test("an all-zero series does not divide by zero", () => {
  render(<Bars values={[0, 0]} />);
  for (const bar of screen.getAllByTestId("bar")) expect(bar.style.height).toBe("8px");
});

test("the chart is decorative — hidden from the accessibility tree", () => {
  const { container } = render(<Bars values={[1, 2]} />);
  expect(container.querySelector("[data-testid='bars']")).toHaveAttribute("aria-hidden", "true");
});

test("bars carry the positive accent — growth reads as a gain, not as inert data", () => {
  render(<Bars values={[1, 2]} />);
  // `.bars .bar` in docs/mockups/sorosense-mock-2.html is a green gradient. A neutral grey bar
  // renders a growth chart as if nothing were growing.
  for (const bar of screen.getAllByTestId("bar")) {
    expect(bar.className).toContain("linear-gradient(180deg,#22c55e,var(--color-pos))");
  }
});
