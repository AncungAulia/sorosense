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
