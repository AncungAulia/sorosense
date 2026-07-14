import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockVaultClient } from "@sorosense/vault-client";
import { VaultProvider } from "../../../providers/VaultProvider";
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

beforeEach(() => {
  openPanel.mockClear();
  useWallet.mockReturnValue({ address: "GABCDEF12345678K3X9", walletName: "Freighter", disconnect: vi.fn() });
});

function open() {
  render(<VaultProvider client={new MockVaultClient()}><AccountMenu /></VaultProvider>);
  const user = userEvent.setup();
  // jsdom exposes `navigator.clipboard` as a read-only getter in this version — Object.assign
  // throws, so Object.defineProperty is the permitted adaptation of test *setup* (not
  // assertions), matching the precedent in account/__tests__/account.test.tsx. Must run AFTER
  // userEvent.setup(): user-event installs its own navigator.clipboard stub during setup(),
  // which would otherwise clobber this mock.
  Object.defineProperty(navigator, "clipboard", { value: { writeText: vi.fn().mockResolvedValue(undefined) }, configurable: true });
  return user;
}

test("avatar toggles the dropdown; it shows the read-only switch and 'Connected via Freighter'", async () => {
  const user = open();
  await user.click(screen.getByRole("button", { name: "Account" }));
  expect(screen.getByRole("menu", { name: "Account" })).toBeInTheDocument();
  const sw = screen.getByRole("switch", { name: "Auto reinvest rewards" });
  expect(sw).toHaveAttribute("aria-disabled", "true"); // stays read-only (deferred)
  expect(screen.getByText("Connected via Freighter")).toBeInTheDocument();
  expect(screen.queryByText(/\b(risk|score|Safe|Watch|Sentinel)\b/i)).toBeNull();
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
