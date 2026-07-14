import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockVaultClient } from "@sorosense/vault-client";
import { VaultProvider } from "../../../providers/VaultProvider";
import { seedVault, SEED_SAFE_EXIT } from "../../../lib/vault/seed";
import { ExitApproval } from "../ExitApproval";

const useWallet = vi.fn();
vi.mock("../../../hooks/useWallet", () => ({ useWallet: () => useWallet() }));

function setup() {
  const sign = vi.fn(async (x: string) => x);
  useWallet.mockReturnValue({ address: "GUSER", isConnected: true, signTransaction: sign });
  const client = new MockVaultClient();
  const onClose = vi.fn();
  return { client, onClose, sign };
}

test("shows the safe-exit move + approve/decline actions", async () => {
  const { client, onClose } = setup();
  await seedVault(client, "GUSER");
  render(<VaultProvider client={client}><ExitApproval open onClose={onClose} /></VaultProvider>);

  await waitFor(() => expect(screen.getByText("Paused EURC pool")).toBeInTheDocument());
  expect(screen.getByText("DeFindex EURC")).toBeInTheDocument();
  expect(screen.getByText(/5\.90% APY/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Approve and sign in wallet" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Keep it paused" })).toBeInTheDocument();
});

test("approve signs approveExit and moves the bucket to the safe pool", async () => {
  const { client, onClose } = setup();
  await seedVault(client, "GUSER");
  const user = userEvent.setup();
  render(<VaultProvider client={client}><ExitApproval open onClose={onClose} /></VaultProvider>);

  await waitFor(() => expect(screen.getByText("DeFindex EURC")).toBeInTheDocument());
  await user.click(screen.getByRole("button", { name: "Approve and sign in wallet" }));

  await waitFor(async () => expect(await client.pendingExit("EUR")).toBeNull());
  expect(await client.activePool("EUR")).toBe(SEED_SAFE_EXIT.EUR);
  expect(onClose).toHaveBeenCalled();
});

test("decline closes without calling the seam — funds stay put", async () => {
  const { client, onClose } = setup();
  await seedVault(client, "GUSER");
  const user = userEvent.setup();
  render(<VaultProvider client={client}><ExitApproval open onClose={onClose} /></VaultProvider>);

  await waitFor(() => expect(screen.getByText("DeFindex EURC")).toBeInTheDocument());
  await user.click(screen.getByRole("button", { name: "Keep it paused" }));

  expect(onClose).toHaveBeenCalled();
  expect(await client.pendingExit("EUR")).not.toBeNull(); // proposal intact, nothing moved
  expect(await client.activePool("EUR")).toBe("pool-blend-eur"); // still the frozen pool
});

/**
 * R5 / KTD4 — approveExit resolves `success: false` when the chain rejects it. Saying "Exit approved.
 * Moving your funds now." on that would tell the user their funds moved out of a paused pool when
 * they did not: the proposal is still pending and the pool is still frozen.
 */
test("a rejected approval says nothing moved — the proposal stays pending, the pool stays paused", async () => {
  const { client, onClose } = setup();
  await seedVault(client, "GUSER");
  const user = userEvent.setup();
  client.simulateFailure();
  render(<VaultProvider client={client}><ExitApproval open onClose={onClose} /></VaultProvider>);

  await waitFor(() => expect(screen.getByText("DeFindex EURC")).toBeInTheDocument());
  await user.click(screen.getByRole("button", { name: "Approve and sign in wallet" }));

  await waitFor(() => expect(screen.getByText(/didn't accept that/i)).toBeInTheDocument());
  expect(screen.queryByText(/exit approved/i)).toBeNull();
  expect(onClose).not.toHaveBeenCalled(); // the exit is still there to approve
  expect(await client.pendingExit("EUR")).not.toBeNull();
  expect(await client.activePool("EUR")).toBe("pool-blend-eur"); // nothing moved
});

test("a double-press fires one approval, not two", async () => {
  const { client, onClose } = setup();
  await seedVault(client, "GUSER");
  const approveExit = vi.spyOn(client, "approveExit");
  render(<VaultProvider client={client}><ExitApproval open onClose={onClose} /></VaultProvider>);

  await waitFor(() => expect(screen.getByText("DeFindex EURC")).toBeInTheDocument());
  // Both presses land in the SAME tick, before React can re-render the button into its disabled
  // state — the in-flight ref is the only thing standing between them and two signatures.
  const approve = screen.getByRole("button", { name: "Approve and sign in wallet" });
  fireEvent.click(approve);
  fireEvent.click(approve);

  await waitFor(() => expect(onClose).toHaveBeenCalled());
  expect(approveExit).toHaveBeenCalledTimes(1);
});
