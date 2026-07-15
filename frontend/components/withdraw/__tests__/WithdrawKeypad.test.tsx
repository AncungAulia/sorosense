import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockVaultClient, mockSigner } from "@sorosense/vault-client";
import { VaultProvider } from "../../../providers/VaultProvider";
import { ToastProvider } from "../../../providers/ToastProvider";
import { seedVault } from "../../../lib/vault/seed";
import { UNIT } from "../../../lib/vault/units";
import { getContributions, resetContributions } from "../../../lib/vault/contributions";
import { WithdrawKeypad } from "../WithdrawKeypad";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, back: vi.fn() }) }));
const useWallet = vi.fn();
vi.mock("../../../hooks/useWallet", () => ({ useWallet: () => useWallet() }));

afterEach(() => {
  resetContributions();
  push.mockClear();
  useWallet.mockClear();
});

test("shows a bucket chevron with >=2 buckets and signs a Max withdrawal", async () => {
  const user = userEvent.setup();
  const sign = vi.fn(async (xdr: string) => `sig:${xdr}`);
  useWallet.mockReturnValue({ address: "GUSER", isConnected: true, signTransaction: sign });
  const client = new MockVaultClient();
  await seedVault(client, "GUSER");
  render(<VaultProvider client={client}><ToastProvider><WithdrawKeypad /></ToastProvider></VaultProvider>);
  await waitFor(() => expect(screen.getByLabelText("Choose bucket")).toBeInTheDocument());
  expect(screen.getByTestId("bucket-chevron")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Max" }));
  await user.click(screen.getByRole("button", { name: "Withdraw" }));
  await waitFor(() => expect(sign).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(screen.getByText("Withdrawal Success")).toBeInTheDocument());
  expect(screen.getByText("Total withdrawn")).toBeInTheDocument();
  expect(screen.getByText("Withdrawn asset")).toBeInTheDocument();
  const txLink = screen.getByRole("link", { name: "Open transaction hash in explorer" });
  expect(txLink).toHaveTextContent(/mock-tx-\d+/);
  expect(txLink).toHaveAttribute("target", "_blank");
  await user.click(screen.getByRole("button", { name: "Back to Home" }));
  expect(push).toHaveBeenCalledWith("/home");
});

test("Max withdraws the full share balance even with sub-cent NAV precision (no dust left behind)", async () => {
  const user = userEvent.setup();
  const sign = vi.fn(async (xdr: string) => `sig:${xdr}`);
  useWallet.mockReturnValue({ address: "GUSER", isConnected: true, signTransaction: sign });
  const client = new MockVaultClient();
  const dep = mockSigner("depositor", "GUSER");
  await client.deposit("GUSER", "USD", 1000n * UNIT).signAndSubmit(dep);
  client.simulateYield("USD", 1_234_567n);

  render(<VaultProvider client={client}><ToastProvider><WithdrawKeypad /></ToastProvider></VaultProvider>);
  await waitFor(() => expect(screen.getByLabelText("Choose bucket")).toBeInTheDocument());
  await user.click(screen.getByRole("button", { name: "Max" }));
  await user.click(screen.getByRole("button", { name: "Withdraw" }));
  await waitFor(() => expect(sign).toHaveBeenCalledTimes(1));
  await waitFor(async () => expect(await client.balanceOf("GUSER", "USD")).toBe(0n));
});

test("a rejected withdrawal shows a failure: shares intact, no cost-basis change, no success screen", async () => {
  const user = userEvent.setup();
  const sign = vi.fn(async (xdr: string) => `sig:${xdr}`);
  useWallet.mockReturnValue({ address: "GUSER", isConnected: true, signTransaction: sign });
  const client = new MockVaultClient();
  await seedVault(client, "GUSER");
  const shares = await client.balanceOf("GUSER", "USD");
  const basis = getContributions("USD");
  render(<VaultProvider client={client}><ToastProvider><WithdrawKeypad /></ToastProvider></VaultProvider>);
  await waitFor(() => expect(screen.getByLabelText("Choose bucket")).toBeInTheDocument());
  client.simulateFailure();

  await user.click(screen.getByRole("button", { name: "Max" }));
  await user.click(screen.getByRole("button", { name: "Withdraw" }));

  await waitFor(() => expect(screen.getByText("Withdrawal Failed")).toBeInTheDocument());
  expect(screen.queryByText("Withdrawal Success")).toBeNull();
  expect(await client.balanceOf("GUSER", "USD")).toBe(shares);
  expect(getContributions("USD")).toBe(basis);
  expect(sign).toHaveBeenCalledTimes(1);
});

test("failed withdrawal shows one return action back to the form", async () => {
  const user = userEvent.setup();
  const sign = vi.fn(async () => {
    throw new Error("wallet rejected");
  });
  useWallet.mockReturnValue({ address: "GUSER", isConnected: true, signTransaction: sign });
  const client = new MockVaultClient();
  await seedVault(client, "GUSER");
  render(<VaultProvider client={client}><ToastProvider><WithdrawKeypad /></ToastProvider></VaultProvider>);

  await waitFor(() => expect(screen.getByLabelText("Choose bucket")).toBeInTheDocument());
  await user.click(screen.getByRole("button", { name: "1" }));
  await user.click(screen.getByRole("button", { name: "Withdraw" }));

  await waitFor(() => expect(screen.getByText("Withdrawal Failed")).toBeInTheDocument());
  expect(screen.queryByRole("button", { name: /try again/i })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Back to Withdraw" }));
  expect(screen.getByRole("button", { name: "Withdraw" })).toBeInTheDocument();
});
