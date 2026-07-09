import { render, screen, waitFor } from "@testing-library/react";
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
