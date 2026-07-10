import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockVaultClient, mockSigner } from "@sorosense/vault-client";
import { VaultProvider } from "../../../../providers/VaultProvider";
import AccountPage from "../page";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
const disconnect = vi.fn();
const useWallet = vi.fn();
vi.mock("../../../../hooks/useWallet", () => ({ useWallet: () => useWallet() }));

const ADDRESS = "GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVWK3X9";

beforeEach(() => {
  vi.clearAllMocks();
  useWallet.mockReturnValue({ address: ADDRESS, walletName: "Freighter", isConnected: true, disconnect });
});

function renderAccount(client = new MockVaultClient()) {
  render(<VaultProvider client={client}><AccountPage /></VaultProvider>);
}

test("shows the identicon, a truncated address, and the connected wallet", async () => {
  renderAccount();
  expect(await screen.findByLabelText("Wallet identicon")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /GABC…K3X9/ })).toBeInTheDocument();
  expect(screen.getByText("Connected via Freighter")).toBeInTheDocument();
});

test("does not claim a connection date it has no source for", () => {
  renderAccount();
  expect(document.body.textContent).not.toMatch(/since/i);
});

test("copying the address raises a toast", async () => {
  const user = userEvent.setup();
  const writeText = vi.fn().mockResolvedValue(undefined);
  // jsdom exposes `navigator.clipboard` as a read-only getter in this version — Object.assign
  // throws. Object.defineProperty is the permitted adaptation of test *setup* (not assertions).
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  renderAccount();
  await user.click(screen.getByRole("button", { name: /GABC…K3X9/ }));
  expect(writeText).toHaveBeenCalledWith(ADDRESS);
  expect(await screen.findByText("Address copied")).toBeInTheDocument();
});

test("Activity routes to the central activity page", async () => {
  const user = userEvent.setup();
  renderAccount();
  await user.click(screen.getByRole("button", { name: /Activity/ }));
  expect(push).toHaveBeenCalledWith("/account/activity");
});

test("auto-reinvest is a read-only status row, not a switch", async () => {
  const client = new MockVaultClient();
  await client.setPolicyConsent(ADDRESS).signAndSubmit(mockSigner("depositor", ADDRESS));
  renderAccount(client);
  await waitFor(() => expect(screen.getByTestId("consent-state").textContent).toBe("On"));
  expect(screen.queryByRole("switch")).not.toBeInTheDocument();
});

test("auto-reinvest reads Off for a user who has not consented", async () => {
  renderAccount();
  await waitFor(() => expect(screen.getByTestId("consent-state").textContent).toBe("Off"));
});

test("Log out confirms before disconnecting", async () => {
  const user = userEvent.setup();
  renderAccount();
  await user.click(screen.getByRole("button", { name: "Log out" }));
  expect(await screen.findByRole("dialog", { name: "Log out" })).toBeInTheDocument();
  expect(disconnect).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Yes, log out" }));
  await waitFor(() => expect(disconnect).toHaveBeenCalled());
  expect(push).toHaveBeenCalledWith("/");
});

test("R11 — Account carries no risk label", async () => {
  renderAccount();
  await screen.findByLabelText("Wallet identicon");
  expect(document.body.textContent).not.toMatch(/\b(safe|watch|risk|score|tier)\b/i);
});
