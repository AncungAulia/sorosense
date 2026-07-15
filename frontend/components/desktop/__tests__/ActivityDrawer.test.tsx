import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockVaultClient } from "@sorosense/vault-client";
import { VaultProvider } from "../../../providers/VaultProvider";
import { ActivityDrawer } from "../ActivityDrawer";

const useWallet = vi.fn();
vi.mock("../../../hooks/useWallet", () => ({ useWallet: () => useWallet() }));

function setup(onReview = vi.fn()) {
  useWallet.mockReturnValue({ address: "GUSER", isConnected: true });
  render(<VaultProvider client={new MockVaultClient()}><ActivityDrawer open onClose={() => {}} onReview={onReview} /></VaultProvider>);
  return userEvent.setup();
}

test("tabs filter the list by cat; Yours hides agent rows, Agent hides user rows", async () => {
  const user = setup();
  // getActivity() fixture: "you" rows include Withdraw, "auto" rows include agent moves.
  expect(screen.getByText("Moved to better yield")).toBeInTheDocument();
  expect(screen.getByText("Withdraw")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Yours" }));
  expect(screen.queryByText("Moved to better yield")).toBeNull();
  expect(screen.getByText("Withdraw")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Agent" }));
  expect(screen.getByText("Moved to better yield")).toBeInTheDocument();
  expect(screen.queryByText("Withdraw")).toBeNull();

  expect(screen.queryByText(/\b(risk|score|sentinel|rebalanced|froze|compound|sign mandate|proposed exit)\b/i)).toBeNull();
});
