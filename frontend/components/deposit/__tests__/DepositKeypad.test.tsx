import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockVaultClient } from "@sorosense/vault-client";
import { VaultProvider } from "../../../providers/VaultProvider";
import { DepositKeypad } from "../DepositKeypad";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, back: vi.fn() }) }));
const useWallet = vi.fn();
vi.mock("../../../hooks/useWallet", () => ({ useWallet: () => useWallet() }));

function setup(sym: string) {
  const sign = vi.fn(async (xdr: string) => `sig:${xdr}`);
  useWallet.mockReturnValue({ address: "GNEW", isConnected: true, signTransaction: sign });
  const client = new MockVaultClient(); // fresh: hasConsent=false → consent required
  render(<VaultProvider client={client}><DepositKeypad sym={sym} /></VaultProvider>);
  return { sign, client };
}

test("no risk-tier control is present", () => {
  setup("usdc");
  expect(screen.queryByText(/conservative|balanced|risk|tier/i)).not.toBeInTheDocument();
});

test("first deposit signs consent then deposit (two signatures)", async () => {
  const user = userEvent.setup();
  const { sign, client } = setup("usdc");
  await user.click(screen.getByRole("button", { name: "1" }));
  await user.click(screen.getByRole("button", { name: "0" }));
  await user.click(screen.getByRole("button", { name: "Deposit fund" }));
  // consent sheet appears
  await user.click(screen.getByRole("button", { name: /agree & sign/i }));
  await waitFor(() => expect(sign).toHaveBeenCalledTimes(2)); // consent + deposit
  await waitFor(async () => expect(await client.balanceOf("GNEW", "USD")).toBeGreaterThan(0n));
  expect(push).toHaveBeenCalledWith("/home");
});
