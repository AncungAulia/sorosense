import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockVaultClient } from "@sorosense/vault-client";
import { VaultProvider } from "../../../../../providers/VaultProvider";
import { seedVault } from "../../../../../lib/vault/seed";
import ActivityPage from "../page";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), back: vi.fn() }) }));
const useWallet = vi.fn();
vi.mock("../../../../../hooks/useWallet", () => ({ useWallet: () => useWallet() }));

function renderActivity() {
  useWallet.mockReturnValue({ address: "GUSER", isConnected: true, signTransaction: vi.fn(async (x: string) => x) });
  const client = new MockVaultClient();
  return seedVault(client, "GUSER").then(() =>
    render(<VaultProvider client={client}><ActivityPage /></VaultProvider>)
  );
}

test("activity page filters to Yours", async () => {
  const user = userEvent.setup();
  await renderActivity();
  expect(screen.getByText(/Switched to DeFindex/)).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Yours" }));
  expect(screen.queryByText(/Switched to DeFindex/)).not.toBeInTheDocument();
  expect(screen.getByText(/Moved \$500 to your wallet/)).toBeInTheDocument();
});

test("AE1 — only the proposed-exit row has a Review action (auto-compound/rebalance never prompt)", async () => {
  await renderActivity();
  // Exactly one Review button: the safe-exit proposal. Rebalance/compound rows carry none.
  expect(screen.getAllByRole("button", { name: "Review" })).toHaveLength(1);
});

test("tapping Review opens the exit approval sheet", async () => {
  const user = userEvent.setup();
  await renderActivity();
  // `hidden: true` includes the aria-hidden (closed) sheet — getByRole excludes it otherwise.
  // Note: dom-accessibility-api's computeAccessibleName ignores the `hidden` query option for the
  // root node itself, so an aria-hidden root always resolves to name "" — match by role alone
  // (only one dialog renders on this page) and assert the label via the raw attribute instead.
  const dialog = screen.getByRole("dialog", { hidden: true });
  expect(dialog).toHaveAttribute("aria-label", "Approve safe exit");
  expect(dialog).toHaveAttribute("aria-hidden", "true");
  await user.click(screen.getByRole("button", { name: "Review" }));
  await waitFor(() => expect(dialog).toHaveAttribute("aria-hidden", "false"));
});
