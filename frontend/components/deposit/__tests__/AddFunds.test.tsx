import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AddFunds } from "../AddFunds";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, back: vi.fn() }) }));

test("lists only fundable stablecoins and routes to deposit", async () => {
  const user = userEvent.setup();
  push.mockClear();
  render(<AddFunds />);
  expect(screen.getByText("USDC")).toBeInTheDocument();
  expect(screen.getByText("EURC")).toBeInTheDocument();
  expect(screen.getByText("CETES")).toBeInTheDocument();
  expect(screen.queryByText(/USDY|Real world assets/i)).not.toBeInTheDocument();
  await user.click(screen.getByText("USDC"));
  expect(push).toHaveBeenCalledWith("/deposit/usdc");
});

test("marks CETES as coming soon and does not route to deposit", async () => {
  const user = userEvent.setup();
  push.mockClear();
  render(<AddFunds />);

  const cetes = screen.getByRole("button", { name: /CETES/i });
  expect(cetes).toBeDisabled();
  expect(screen.getByText("Coming soon")).toBeInTheDocument();

  await user.click(cetes);
  expect(push).not.toHaveBeenCalled();
});
