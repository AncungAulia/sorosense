import { render, screen } from "@testing-library/react";
import { Card } from "../Card";
test("renders children inside a card", () => {
  render(<Card>hello</Card>);
  expect(screen.getByText("hello")).toBeInTheDocument();
});
