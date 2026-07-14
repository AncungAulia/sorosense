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
const signTransaction = vi.fn(async (xdr: string) => xdr);

beforeEach(() => {
  vi.clearAllMocks();
  useWallet.mockReturnValue({ address: ADDRESS, walletName: "Freighter", isConnected: true, disconnect, signTransaction });
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
  // useAutoCompound() resolves on a later microtask; wait for it to land before asserting, so the
  // state update commits inside act() rather than after the test body returns.
  await screen.findByTestId("auto-compound-state");
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

test("auto-reinvest reads ON for a fresh user — the seam's default is enabled (unset = on)", async () => {
  renderAccount();
  await waitFor(() => expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true"));
});

test("auto-reinvest reads OFF for a depositor who revoked it", async () => {
  const client = new MockVaultClient();
  await client.setAutoCompound(ADDRESS, false).signAndSubmit(mockSigner("depositor", ADDRESS));
  renderAccount(client);
  await waitFor(() => expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "false"));
});

test("R1/R2 — the switch is live and revocable: OFF, then ON again, both wallet-signed", async () => {
  const user = userEvent.setup();
  const client = new MockVaultClient();
  renderAccount(client);
  const control = await screen.findByRole("switch");
  await waitFor(() => expect(control).toBeEnabled());

  await user.click(control);
  await waitFor(() => expect(control).toHaveAttribute("aria-checked", "false"));
  await expect(client.autoCompoundEnabled(ADDRESS)).resolves.toBe(false);
  expect(signTransaction).toHaveBeenCalledTimes(1);

  await user.click(control);
  await waitFor(() => expect(control).toHaveAttribute("aria-checked", "true"));
  await expect(client.autoCompoundEnabled(ADDRESS)).resolves.toBe(true);
  expect(signTransaction).toHaveBeenCalledTimes(2);
});

test("R1 — toggling never touches the safety mandate (KTD3): hasConsent is unchanged", async () => {
  const user = userEvent.setup();
  const client = new MockVaultClient();
  await client.setPolicyConsent(ADDRESS).signAndSubmit(mockSigner("depositor", ADDRESS));
  const setPolicyConsent = vi.spyOn(client, "setPolicyConsent");
  renderAccount(client);
  const control = await screen.findByRole("switch");
  await waitFor(() => expect(control).toBeEnabled());

  await user.click(control);
  await waitFor(() => expect(control).toHaveAttribute("aria-checked", "false"));

  // This is the invariant the whole ticket rests on: the economic preference and the irrevocable
  // safety mandate are separate grants, and this switch writes only the former.
  await expect(client.hasConsent(ADDRESS)).resolves.toBe(true);
  expect(setPolicyConsent).not.toHaveBeenCalled();
});

test("a declined signature leaves the switch where it was and says so", async () => {
  const user = userEvent.setup();
  signTransaction.mockRejectedValueOnce({ code: -1, message: "The user closed the modal." });
  const client = new MockVaultClient();
  renderAccount(client);
  const control = await screen.findByRole("switch");
  await waitFor(() => expect(control).toBeEnabled());

  await user.click(control);

  expect(await screen.findByText("Signature cancelled. Nothing changed.")).toBeInTheDocument();
  expect(control).toHaveAttribute("aria-checked", "true"); // never moved
  await expect(client.autoCompoundEnabled(ADDRESS)).resolves.toBe(true); // nothing written
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
