import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockVaultClient, mockSigner } from "@sorosense/vault-client";
import { VaultProvider } from "../../../providers/VaultProvider";
import { seedVault } from "../../../lib/vault/seed";
import { UNIT } from "../../../lib/vault/units";
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

// STE-24 regression: assetValueOf can carry sub-cent remainders (real NAV math), but the Max
// button's display is 2dp-truncated (fromAmount). Re-deriving "is this Max?" by re-parsing that
// truncated string and comparing to the untruncated bucket value used to read as < the bucket
// value, so Max would withdraw the truncated (dust-leaving) amount instead of the full shares.
// Track Max via explicit state instead of inferring it from the (lossy) display string.
test("Max withdraws the full share balance even with sub-cent NAV precision (no dust left behind)", async () => {
  const user = userEvent.setup();
  const sign = vi.fn(async (xdr: string) => `sig:${xdr}`);
  useWallet.mockReturnValue({ address: "GUSER", isConnected: true, signTransaction: sign });
  const client = new MockVaultClient();
  const dep = mockSigner("depositor", "GUSER");
  await client.deposit("GUSER", "USD", 1000n * UNIT).signAndSubmit(dep);
  // Sub-cent yield: assetValueOf ends up with precision below the display's 2dp, e.g. "1000.12"
  // truncates a value like 1000.1234567 — the truncated round-trip is strictly less than the
  // real bucket value, which is exactly the condition that broke the old `enteredAmount >= value`
  // inference.
  client.simulateYield("USD", 1_234_567n);

  render(<VaultProvider client={client}><WithdrawKeypad /></VaultProvider>);
  await waitFor(() => expect(screen.getByLabelText("Choose bucket")).toBeInTheDocument());
  await user.click(screen.getByRole("button", { name: "Max" }));
  await user.click(screen.getByRole("button", { name: "Move to wallet" }));
  await waitFor(() => expect(sign).toHaveBeenCalledTimes(1));
  // Full withdrawal leaves zero shares — the truncated-amount path would instead leave a small
  // positive remainder (dust) in the bucket.
  await waitFor(async () => expect(await client.balanceOf("GUSER", "USD")).toBe(0n));
});
