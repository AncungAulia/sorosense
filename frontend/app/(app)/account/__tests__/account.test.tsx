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

test("does not claim a connection date it has no source for", async () => {
  renderAccount();
  // useConsent() resolves on a later microtask; wait for it to land before asserting, so the
  // state update commits inside act() rather than after the test body returns.
  await screen.findByTestId("consent-state");
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

test("auto-reinvest reads checked once the mandate is signed", async () => {
  const client = new MockVaultClient();
  await client.setPolicyConsent(ADDRESS).signAndSubmit(mockSigner("depositor", ADDRESS));
  renderAccount(client);
  await waitFor(() => expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true"));
});

test("auto-reinvest reads unchecked for a user who has not consented", async () => {
  renderAccount();
  await waitFor(() => expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "false"));
});

test("the switch displays consent — it cannot grant or revoke it (no execution path from Account)", async () => {
  const user = userEvent.setup();
  renderAccount();
  const control = await screen.findByRole("switch");

  // The seam has no revoke, and granting is a write — which STE-26 forbids from this tab. So the
  // control is inert by construction, not merely unwired: clicking it must not flip the state, and
  // assistive tech must announce it as disabled rather than inviting the press.
  expect(control).toBeDisabled();
  expect(control).toHaveAttribute("aria-disabled", "true");

  await user.click(control);
  expect(control).toHaveAttribute("aria-checked", "false");
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
