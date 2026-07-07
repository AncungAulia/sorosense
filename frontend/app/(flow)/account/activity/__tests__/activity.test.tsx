import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ActivityPage from "../page";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), back: vi.fn() }) }));

test("activity page filters to Yours", async () => {
  const user = userEvent.setup();
  render(<ActivityPage />);
  expect(screen.getByText(/Switched to DeFindex/)).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Yours" }));
  expect(screen.queryByText(/Switched to DeFindex/)).not.toBeInTheDocument(); // auto item hidden
  expect(screen.getByText(/Moved \$500 to your wallet/)).toBeInTheDocument();
});
