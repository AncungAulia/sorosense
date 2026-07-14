import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockVaultClient } from "@sorosense/vault-client";
import { VaultProvider } from "../../../providers/VaultProvider";
import { ToastProvider } from "../../../providers/ToastProvider";
import { AddFundsDrawer } from "../AddFundsDrawer";
import { getContributions, resetContributions } from "../../../lib/vault/contributions";

const useWallet = vi.fn();
vi.mock("../../../hooks/useWallet", () => ({ useWallet: () => useWallet() }));

// The cost-basis ledger is a module singleton — keep each test's contributions its own.
afterEach(() => resetContributions());

function setup() {
  const sign = vi.fn(async (xdr: string) => `sig:${xdr}`);
  const onClose = vi.fn();
  useWallet.mockReturnValue({ address: "GNEW", isConnected: true, signTransaction: sign });
  const client = new MockVaultClient(); // fresh → hasConsent=false → consent step surfaces
  render(
    <VaultProvider client={client}><ToastProvider>
      <AddFundsDrawer open onClose={onClose} />
    </ToastProvider></VaultProvider>,
  );
  return { sign, client, onClose };
}

test("pick USDC → deposit through consent → drawer closes on success, no risk words", async () => {
  const user = userEvent.setup();
  const { sign, client, onClose } = setup();
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
  // Desktop: success closes the drawer + a toast (no in-drawer done screen).
  await waitFor(() => expect(onClose).toHaveBeenCalled());
  expect(screen.queryByText(/\b(risk|score|sentinel)\b/i)).toBeNull();
});

test("with no Horizon/API env the fixture balance renders and the faucet slot stays empty", async () => {
  const user = userEvent.setup();
  const fetchSpy = vi.fn();
  vi.stubGlobal("fetch", fetchSpy);
  setup();

  await user.click(screen.getByRole("button", { name: /USDC/ }));

  // The reserved faucet slot renders nothing off-network: no dead control, and no request either.
  expect(screen.getByText("$9,076.00 USDC")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Get test/ })).toBeNull();
  expect(fetchSpy).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

/**
 * R5 / KTD4 — a chain-rejected write resolves `success: false` (it does not throw). On desktop the
 * success reaction is "close the drawer + toast", so a rejection must do neither, and must leave the
 * cost basis alone.
 */
test("a rejected deposit keeps the drawer open, toasts nothing, and records no cost basis", async () => {
  const user = userEvent.setup();
  const { client, onClose, sign } = setup();
  // Settle the dev seed first so the assertions read this deposit's effect, not the seed's.
  await waitFor(async () => expect(await client.balanceOf("GNEW", "USD")).toBeGreaterThan(0n));
  const shares = await client.balanceOf("GNEW", "USD");
  const basis = getContributions("USD");
  client.simulateFailure();

  await user.click(screen.getByRole("button", { name: /USDC/ }));
  fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "10" } });
  await user.click(screen.getByRole("button", { name: "Deposit" }));
  await user.click(screen.getByRole("button", { name: /agree & sign/i }));

  await waitFor(() => expect(screen.getByText("Couldn't complete")).toBeInTheDocument());
  expect(onClose).not.toHaveBeenCalled(); // the drawer stays put — nothing was deposited
  expect(screen.queryByText("Deposited. Agent is allocating.")).toBeNull();
  expect(await client.balanceOf("GNEW", "USD")).toBe(shares);
  expect(getContributions("USD")).toBe(basis);
  expect(sign).toHaveBeenCalledTimes(1); // consent failed → the deposit was never attempted
});
