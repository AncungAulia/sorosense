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
  // getActivity() fixture: "you" rows include "Moved $500...", "auto" rows include "Switched to DeFindex..."
  expect(screen.getByText(/Switched to DeFindex/)).toBeInTheDocument();
  expect(screen.getByText(/Moved \$500/)).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Yours" }));
  expect(screen.queryByText(/Switched to DeFindex/)).toBeNull();
  expect(screen.getByText(/Moved \$500/)).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Agent" }));
  expect(screen.getByText(/Switched to DeFindex/)).toBeInTheDocument();
  expect(screen.queryByText(/Moved \$500/)).toBeNull();

  // R11: the true forbidden risk-tier tokens. "safe exit" is the vetted ACTION name (the fixture's
  // visible "Proposed safe exit from EURC pool" is legit copy, not a risk label) — same call as the
  // Plan-1 desktop e2e regex. Assert the tokens that must NEVER appear on any surface.
  expect(screen.queryByText(/\b(risk|score|sentinel)\b/i)).toBeNull();
});
