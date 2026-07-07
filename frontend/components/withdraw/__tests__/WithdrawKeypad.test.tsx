import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockVaultClient } from "@sorosense/vault-client";
import { VaultProvider } from "../../../providers/VaultProvider";
import { seedVault } from "../../../lib/vault/seed";
import { WithdrawKeypad } from "../WithdrawKeypad";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, back: vi.fn() }) }));
const useWallet = vi.fn();
vi.mock("../../../hooks/useWallet", () => ({ useWallet: () => useWallet() }));

test("shows a bucket chevron with ≥2 buckets and signs a Max withdrawal", async () => {
  const user = userEvent.setup();
  const sign = vi.fn(async (xdr: string) => `sig:${xdr}`);
  useWallet.mockReturnValue({ address: "GUSER", isConnected: true, signTransaction: sign });
  const client = new MockVaultClient();
  await seedVault(client, "GUSER"); // 2 buckets (USD, EUR)
  render(<VaultProvider client={client}><WithdrawKeypad /></VaultProvider>);
  await waitFor(() => expect(screen.getByLabelText("Choose bucket")).toBeInTheDocument());
  expect(screen.getByTestId("bucket-chevron")).toBeInTheDocument(); // ≥2 buckets
  await user.click(screen.getByRole("button", { name: "Max" }));
  await user.click(screen.getByRole("button", { name: "Move to wallet" }));
  await waitFor(() => expect(sign).toHaveBeenCalledTimes(1));
});
