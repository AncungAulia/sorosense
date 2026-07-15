import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockVaultClient } from "@sorosense/vault-client";
import { VaultProvider } from "../../../../providers/VaultProvider";
import { seedVault } from "../../../../lib/vault/seed";
import EarnPage from "../page";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
const useWallet = vi.fn();
vi.mock("../../../../hooks/useWallet", () => ({ useWallet: () => useWallet() }));

test("earn stub routes to deposit and withdraw", async () => {
  const user = userEvent.setup();
  useWallet.mockReturnValue({ address: "GUSER", isConnected: true });
  const client = new MockVaultClient();
  await seedVault(client, "GUSER");
  render(<VaultProvider client={client}><EarnPage /></VaultProvider>);
  await waitFor(() => expect(screen.getByRole("button", { name: "Withdraw" })).toBeInTheDocument());
  await user.click(screen.getByRole("button", { name: "Withdraw" }));
  expect(push).toHaveBeenCalledWith("/withdraw");
});
