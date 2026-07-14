import { render, screen } from "@testing-library/react";
import { Skeleton } from "../Skeleton";

test("renders a decorative shimmer placeholder with the caller's sizing", () => {
  render(<Skeleton className="h-4 w-20" />);
  const el = screen.getByTestId("skeleton");
  expect(el).toHaveAttribute("aria-hidden");
  expect(el).toHaveClass("skeleton"); // the base owns the shimmer + reduced-motion (globals.css)
  expect(el).toHaveClass("h-4", "w-20"); // caller sizing passes through
});
