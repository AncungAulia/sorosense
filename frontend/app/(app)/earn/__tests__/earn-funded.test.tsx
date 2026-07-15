import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockVaultClient } from "@sorosense/vault-client";
import { VaultProvider } from "../../../../providers/VaultProvider";
import { seedVault } from "../../../../lib/vault/seed";
import EarnPage from "../page";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
const useWallet = vi.fn();
vi.mock("../../../../hooks/useWallet", () => ({ useWallet: () => useWallet() }));

async function renderFunded() {
  useWallet.mockReturnValue({ address: "GUSER", isConnected: true });
  const client = new MockVaultClient();
  await seedVault(client, "GUSER");
  render(<VaultProvider client={client}><EarnPage /></VaultProvider>);
  await waitFor(() => expect(screen.getByText("Total earned")).toBeInTheDocument());
}

test("the hero shows total earned with a balance-and-APY subline", async () => {
  await renderFunded();
  expect(screen.getByText(/balance · \d+\.\d{2}% APY/)).toBeInTheDocument();
});

test("the Growth card renders bars and the monthly breakdown", async () => {
  await renderFunded();
  expect(screen.getByText("Growth")).toBeInTheDocument();
  expect(screen.getAllByTestId("bar")).toHaveLength(12); // default period: year (12 monthly bars)
  expect(screen.getAllByTestId("month-row")).toHaveLength(3);
});

test("the bucket toggle swaps the hero but never the Growth card", async () => {
  const user = userEvent.setup();
  await renderFunded();
  const barsBefore = screen.getAllByTestId("bar").map((b) => b.style.height);
  await user.click(screen.getByRole("button", { name: "Switch bucket" }));
  expect(screen.getByText("USD bucket")).toBeInTheDocument();
  expect(screen.getAllByTestId("bar").map((b) => b.style.height)).toEqual(barsBefore);
});

test("both actions route back into the existing deposit/withdraw flows", async () => {
  const user = userEvent.setup();
  await renderFunded();
  await user.click(screen.getByRole("button", { name: "Deposit" }));
  expect(push).toHaveBeenCalledWith("/deposit");
  await user.click(screen.getByRole("button", { name: "Withdraw" }));
  expect(push).toHaveBeenCalledWith("/withdraw");
});

test("R11 — no risk label, tier, or score is rendered in the funded state", async () => {
  await renderFunded();
  expect(document.body.textContent).not.toMatch(/\b(safe|watch|risk|score|tier)\b/i);
});
