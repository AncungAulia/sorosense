import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockVaultClient } from "@sorosense/vault-client";
import { VaultProvider } from "../../../providers/VaultProvider";
import { ToastProvider } from "../../../providers/ToastProvider";
import { seedVault } from "../../../lib/vault/seed";
import { WithdrawDrawer } from "../WithdrawDrawer";

const useWallet = vi.fn();
vi.mock("../../../hooks/useWallet", () => ({ useWallet: () => useWallet() }));

async function setup() {
  const sign = vi.fn(async (x: string) => x);
  useWallet.mockReturnValue({ address: "GUSER", isConnected: true, signTransaction: sign });
  const client = new MockVaultClient();
  await seedVault(client, "GUSER"); // funds USD + EUR (≥2 buckets)
  render(
    <VaultProvider client={client}><ToastProvider>
      <WithdrawDrawer open onClose={() => {}} />
    </ToastProvider></VaultProvider>,
  );
  return { sign, client };
}

test("cycler shows with ≥2 buckets; over-balance disables the button and shows the hint", async () => {
  await setup();
  await waitFor(() => expect(screen.getByText("USD bucket")).toBeInTheDocument());
  expect(screen.getByTestId("bucket-chevron")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "999999" } });
  expect(screen.getByText(/not enough balance/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Move to wallet" })).toBeDisabled();
});

test("a valid withdraw signs, reduces the balance, and shows the done step", async () => {
  const user = userEvent.setup();
  const { sign, client } = await setup();
  await waitFor(() => expect(screen.getByText("USD bucket")).toBeInTheDocument());
  const before = await client.balanceOf("GUSER", "USD");
  fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "10" } });
  await user.click(screen.getByRole("button", { name: "Move to wallet" }));
  await waitFor(() => expect(sign).toHaveBeenCalled());
  await waitFor(async () => expect(await client.balanceOf("GUSER", "USD")).toBeLessThan(before));
  expect(screen.getByText(/sent to your wallet/i)).toBeInTheDocument();
});
