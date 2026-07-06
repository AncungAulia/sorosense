import { render, screen } from "@testing-library/react";
import { Chip } from "../Chip";
test("renders chip text", () => {
  render(<Chip>Recommended</Chip>);
  expect(screen.getByText("Recommended")).toBeInTheDocument();
});
