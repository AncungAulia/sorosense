import { render, screen, waitFor } from "@testing-library/react";
import { MockVaultClient } from "@sorosense/vault-client";
import { VaultProvider } from "../../../../../providers/VaultProvider";
import { seedVault } from "../../../../../lib/vault/seed";
import { DepositKeypad } from "../../../../../components/deposit/DepositKeypad";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), back: vi.fn() }) }));
const useWallet = vi.fn();
vi.mock("../../../../../hooks/useWallet", () => ({ useWallet: () => useWallet() }));

test("EURC deposit shows the amber paused-pool note (seeded frozen EUR)", async () => {
  const sign = vi.fn(async (x: string) => x);
  useWallet.mockReturnValue({ address: "GUSER", isConnected: true, signTransaction: sign });
  const client = new MockVaultClient();
  await seedVault(client, "GUSER"); // EUR pool seeded frozen
  render(<VaultProvider client={client}><DepositKeypad sym="eurc" /></VaultProvider>);
  await waitFor(() => expect(screen.getByText(/pool is paused/i)).toBeInTheDocument());
});

test("USDC deposit shows no amber note (USD pool active)", async () => {
  const sign = vi.fn(async (x: string) => x);
  useWallet.mockReturnValue({ address: "GUSER", isConnected: true, signTransaction: sign });
  const client = new MockVaultClient();
  await seedVault(client, "GUSER");
  render(<VaultProvider client={client}><DepositKeypad sym="usdc" /></VaultProvider>);
  await waitFor(() => expect(screen.getByRole("button", { name: "Deposit fund" })).toBeInTheDocument());
  expect(screen.queryByText(/pool is paused/i)).not.toBeInTheDocument();
});
