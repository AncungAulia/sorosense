import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockVaultClient, mockSigner } from "@sorosense/vault-client";
import { VaultProvider } from "../../../providers/VaultProvider";
import { ToastProvider } from "../../../providers/ToastProvider";
import { AccountMenu } from "../AccountMenu";

const push = vi.fn();
const openPanel = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  usePathname: () => "/home",
  useSearchParams: () => new URLSearchParams(""),
}));
vi.mock("../../../hooks/usePanel", () => ({ usePanel: () => ({ panel: null, open: openPanel, close: vi.fn() }) }));
const useWallet = vi.fn();
vi.mock("../../../hooks/useWallet", () => ({ useWallet: () => useWallet() }));

const ADDRESS = "GABCDEF12345678K3X9";
const signTransaction = vi.fn(async (xdr: string) => xdr);

beforeEach(() => {
  vi.clearAllMocks();
  useWallet.mockReturnValue({ address: ADDRESS, walletName: "Freighter", disconnect: vi.fn(), signTransaction });
});

function open(client = new MockVaultClient()) {
  render(<VaultProvider client={client}><ToastProvider><AccountMenu /></ToastProvider></VaultProvider>);
  const user = userEvent.setup();
  // jsdom exposes `navigator.clipboard` as a read-only getter in this version — Object.assign
  // throws, so Object.defineProperty is the permitted adaptation of test *setup* (not
  // assertions), matching the precedent in account/__tests__/account.test.tsx. Must run AFTER
  // userEvent.setup(): user-event installs its own navigator.clipboard stub during setup(),
  // which would otherwise clobber this mock.
  Object.defineProperty(navigator, "clipboard", { value: { writeText: vi.fn().mockResolvedValue(undefined) }, configurable: true });
  return user;
}

test("avatar toggles the dropdown; it shows the auto-reinvest switch and 'Connected via Freighter'", async () => {
  const user = open();
  await user.click(screen.getByRole("button", { name: "Account" }));
  expect(screen.getByRole("menu", { name: "Account" })).toBeInTheDocument();
  const sw = screen.getByRole("switch", { name: "Auto reinvest rewards" });
  // Live control (STE-38): pressable once the seam read lands, and ON by default (unset = enabled).
  await waitFor(() => expect(sw).toBeEnabled());
  expect(sw).toHaveAttribute("aria-checked", "true");
  expect(screen.getByText("Connected via Freighter")).toBeInTheDocument();
  expect(screen.queryByText(/\b(risk|score|Safe|Watch|Sentinel)\b/i)).toBeNull();
});

test("R1/R2 — the desktop switch toggles auto-compound and leaves the mandate untouched", async () => {
  const client = new MockVaultClient();
  await client.setPolicyConsent(ADDRESS).signAndSubmit(mockSigner("depositor", ADDRESS));
  const setPolicyConsent = vi.spyOn(client, "setPolicyConsent");
  const user = open(client);
  await user.click(screen.getByRole("button", { name: "Account" }));
  const sw = screen.getByRole("switch", { name: "Auto reinvest rewards" });
  await waitFor(() => expect(sw).toBeEnabled());

  await user.click(sw); // OFF
  await waitFor(() => expect(sw).toHaveAttribute("aria-checked", "false"));
  await expect(client.autoCompoundEnabled(ADDRESS)).resolves.toBe(false);

  await user.click(sw); // back ON — revocable both ways
  await waitFor(() => expect(sw).toHaveAttribute("aria-checked", "true"));
  await expect(client.autoCompoundEnabled(ADDRESS)).resolves.toBe(true);

  await expect(client.hasConsent(ADDRESS)).resolves.toBe(true); // KTD3: never touched
  expect(setPolicyConsent).not.toHaveBeenCalled();
});

test("a declined signature raises the global toast and leaves the switch where it was", async () => {
  signTransaction.mockRejectedValueOnce({ code: -1, message: "The user closed the modal." });
  const client = new MockVaultClient();
  const user = open(client);
  await user.click(screen.getByRole("button", { name: "Account" }));
  const sw = screen.getByRole("switch", { name: "Auto reinvest rewards" });
  await waitFor(() => expect(sw).toBeEnabled());

  await user.click(sw);

  expect(await screen.findByText("Signature cancelled. Nothing changed.")).toBeInTheDocument();
  expect(sw).toHaveAttribute("aria-checked", "true");
  await expect(client.autoCompoundEnabled(ADDRESS)).resolves.toBe(true);
});

test("Activity row opens the activity panel; copy pill writes the address and shows 'Copied'", async () => {
  const user = open();
  await user.click(screen.getByRole("button", { name: "Account" }));
  await user.click(screen.getByRole("menuitem", { name: /activity/i }));
  expect(openPanel).toHaveBeenCalledWith("activity");
  // reopen (Activity click closed it) and copy
  await user.click(screen.getByRole("button", { name: "Account" }));
  await user.click(screen.getByText("GABC…K3X9"));
  expect(navigator.clipboard.writeText).toHaveBeenCalledWith("GABCDEF12345678K3X9");
  expect(await screen.findByText("Copied")).toBeInTheDocument();
});
