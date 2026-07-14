import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockVaultClient } from "@sorosense/vault-client";
import { VaultProvider } from "../../../providers/VaultProvider";
import { ToastProvider } from "../../../providers/ToastProvider";
import { seedVault } from "../../../lib/vault/seed";
import { WithdrawDrawer } from "../WithdrawDrawer";
import { getContributions, resetContributions } from "../../../lib/vault/contributions";

const useWallet = vi.fn();
vi.mock("../../../hooks/useWallet", () => ({ useWallet: () => useWallet() }));

// The cost-basis ledger is a module singleton — keep each test's contributions its own.
afterEach(() => resetContributions());

async function setup() {
  const sign = vi.fn(async (x: string) => x);
  const onClose = vi.fn();
  useWallet.mockReturnValue({ address: "GUSER", isConnected: true, signTransaction: sign });
  const client = new MockVaultClient();
  await seedVault(client, "GUSER"); // funds USD + EUR (≥2 buckets)
  render(
    <VaultProvider client={client}><ToastProvider>
      <WithdrawDrawer open onClose={onClose} />
    </ToastProvider></VaultProvider>,
  );
  return { sign, client, onClose };
}

test("cycler shows with ≥2 buckets; over-balance disables the button and shows the hint", async () => {
  await setup();
  await waitFor(() => expect(screen.getByText("USD bucket")).toBeInTheDocument());
  expect(screen.getByTestId("bucket-chevron")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "999999" } });
  expect(screen.getByText(/not enough balance/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Move to wallet" })).toBeDisabled();
});

test("a valid withdraw signs, reduces the balance, and closes the drawer", async () => {
  const user = userEvent.setup();
  const { sign, client, onClose } = await setup();
  await waitFor(() => expect(screen.getByText("USD bucket")).toBeInTheDocument());
  const before = await client.balanceOf("GUSER", "USD");
  fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "10" } });
  await user.click(screen.getByRole("button", { name: "Move to wallet" }));
  await waitFor(() => expect(sign).toHaveBeenCalled());
  await waitFor(async () => expect(await client.balanceOf("GUSER", "USD")).toBeLessThan(before));
  // Desktop: success closes the drawer + a toast (no in-drawer done screen).
  await waitFor(() => expect(onClose).toHaveBeenCalled());
});

/** R5 / KTD4 — desktop mirror: a rejected burn must not close the drawer, toast, or move cost basis. */
test("a rejected withdrawal keeps the drawer open, toasts nothing, and leaves the bucket intact", async () => {
  const user = userEvent.setup();
  const { client, onClose } = await setup();
  await waitFor(() => expect(screen.getByText("USD bucket")).toBeInTheDocument());
  const shares = await client.balanceOf("GUSER", "USD");
  const basis = getContributions("USD");
  client.simulateFailure();

  fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "10" } });
  await user.click(screen.getByRole("button", { name: "Move to wallet" }));

  await waitFor(() => expect(screen.getByText("Couldn't complete")).toBeInTheDocument());
  expect(onClose).not.toHaveBeenCalled();
  expect(screen.queryByText("Withdrawal submitted.")).toBeNull();
  expect(await client.balanceOf("GUSER", "USD")).toBe(shares);
  expect(getContributions("USD")).toBe(basis);
});
