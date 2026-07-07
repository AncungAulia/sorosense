import { render, screen } from "@testing-library/react";
import { Toast } from "../Toast";
test("renders the message", () => {
  render(<Toast open message="Deposited. Agent is allocating." />);
  expect(screen.getByText("Deposited. Agent is allocating.")).toBeInTheDocument();
});
