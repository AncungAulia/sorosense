import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockVaultClient } from "@sorosense/vault-client";
import { VaultProvider } from "../../../../providers/VaultProvider";
import EarnPage from "../page";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
const useWallet = vi.fn();
vi.mock("../../../../hooks/useWallet", () => ({ useWallet: () => useWallet() }));

async function renderEmpty() {
  // No address → no buckets → hasDeposit false, and VaultProvider never seeds.
  useWallet.mockReturnValue({ address: null, isConnected: false });
  render(<VaultProvider client={new MockVaultClient()}><EarnPage /></VaultProvider>);
  await waitFor(() => expect(screen.getByText("Earn balance")).toBeInTheDocument());
}

test("shows a zero balance, the simulator, and a route into deposit", async () => {
  const user = userEvent.setup();
  await renderEmpty();
  expect(screen.getByTestId("earn-balance").textContent).toBe("$0.00");
  expect(screen.getByText("Simulate earnings")).toBeInTheDocument();
  expect(screen.getByText("No lockup, move to your wallet anytime")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Start earning" }));
  expect(push).toHaveBeenCalledWith("/add-funds");
});

test("the hero APY tracks the simulator's currency", async () => {
  const user = userEvent.setup();
  await renderEmpty();
  expect(screen.getByTestId("hero-apy").textContent).toBe("8.59% APY");
  await user.click(screen.getByRole("button", { name: "EUR" }));
  expect(screen.getByTestId("hero-apy").textContent).toBe("5.10% APY");
  expect(screen.getByTestId("projection").textContent).toBe("€51.00");
});

test("R3 — the empty state offers no MXN currency control", async () => {
  await renderEmpty();
  expect(screen.queryByRole("button", { name: "MXN" })).toBeNull();
});

test("R11 — no risk label, tier, or score is rendered in the empty state", async () => {
  await renderEmpty();
  expect(document.body.textContent).not.toMatch(/\b(safe|watch|risk|score|tier)\b/i);
});
