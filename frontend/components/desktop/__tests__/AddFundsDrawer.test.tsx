import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockVaultClient } from "@sorosense/vault-client";
import { VaultProvider } from "../../../providers/VaultProvider";
import { ToastProvider } from "../../../providers/ToastProvider";
import { AddFundsDrawer } from "../AddFundsDrawer";

const useWallet = vi.fn();
vi.mock("../../../hooks/useWallet", () => ({ useWallet: () => useWallet() }));

function setup() {
  const sign = vi.fn(async (xdr: string) => `sig:${xdr}`);
  useWallet.mockReturnValue({ address: "GNEW", isConnected: true, signTransaction: sign });
  const client = new MockVaultClient(); // fresh → hasConsent=false → consent step surfaces
  render(
    <VaultProvider client={client}><ToastProvider>
      <AddFundsDrawer open onClose={() => {}} />
    </ToastProvider></VaultProvider>,
  );
  return { sign, client };
}

test("pick USDC → deposit through consent → done step, and no risk words", async () => {
  const user = userEvent.setup();
  const { sign, client } = setup();
  // Step 1: stablecoin list.
  await user.click(screen.getByRole("button", { name: /USDC/ }));
  // Step 2: header switches to "Deposit USDC".
  expect(screen.getByText("Deposit USDC")).toBeInTheDocument();
  // Amount input (plain <input>, not the numpad).
  fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "10" } });
  await user.click(screen.getByRole("button", { name: "Deposit" }));
  // Consent shows in the Dialog (not a BottomSheet).
  await user.click(screen.getByRole("button", { name: /agree & sign/i }));
  await waitFor(() => expect(sign).toHaveBeenCalledTimes(2)); // consent + deposit
  await waitFor(async () => expect(await client.balanceOf("GNEW", "USD")).toBeGreaterThan(0n));
  expect(screen.getByText(/deposit sent/i)).toBeInTheDocument(); // in-drawer done step
  expect(screen.queryByText(/\b(risk|score|Safe|Watch|Sentinel)\b/i)).toBeNull();
});
