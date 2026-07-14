import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockVaultClient } from "@sorosense/vault-client";
import { VaultProvider } from "../../../providers/VaultProvider";
import { seedVault, SEED_SAFE_EXIT } from "../../../lib/vault/seed";
import { SafeExitDialog } from "../SafeExitDialog";

const useWallet = vi.fn();
vi.mock("../../../hooks/useWallet", () => ({ useWallet: () => useWallet() }));

async function setup() {
  const sign = vi.fn(async (x: string) => x);
  useWallet.mockReturnValue({ address: "GUSER", isConnected: true, signTransaction: sign });
  const client = new MockVaultClient();
  await seedVault(client, "GUSER"); // frozen EUR pool + proposal
  const onClose = vi.fn();
  render(<VaultProvider client={client}><SafeExitDialog open onClose={onClose} /></VaultProvider>);
  return { client, onClose };
}

test("renders the approve/decline decision with no Sentinel/risk wording", async () => {
  await setup();
  await waitFor(() => expect(screen.getByText("DeFindex EURC")).toBeInTheDocument());
  expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Keep paused" })).toBeInTheDocument();
  expect(screen.queryByText(/\b(risk|score|sentinel)\b/i)).toBeNull();
});

test("Approve signs approveExit and moves the bucket to the safe pool", async () => {
  const user = userEvent.setup();
  const { client, onClose } = await setup();
  await waitFor(() => expect(screen.getByText("DeFindex EURC")).toBeInTheDocument());
  await user.click(screen.getByRole("button", { name: "Approve" }));
  await waitFor(async () => expect(await client.pendingExit("EUR")).toBeNull());
  expect(await client.activePool("EUR")).toBe(SEED_SAFE_EXIT.EUR);
  expect(onClose).toHaveBeenCalled();
});
