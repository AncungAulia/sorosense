import { render, screen } from "@testing-library/react";
import { Skeleton } from "../Skeleton";

test("renders a pulsing, decorative placeholder that stills under reduced motion", () => {
  render(<Skeleton className="h-4 w-20" />);
  const el = screen.getByTestId("skeleton");
  expect(el).toHaveAttribute("aria-hidden");
  expect(el).toHaveClass("animate-pulse");
  expect(el).toHaveClass("motion-reduce:animate-none");
  expect(el).toHaveClass("h-4", "w-20"); // caller sizing passes through
});
