import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockVaultClient } from "@sorosense/vault-client";
import { VaultProvider } from "../../../../providers/VaultProvider";
import { seedVault } from "../../../../lib/vault/seed";
import HomePage from "../page";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
const useWallet = vi.fn();
vi.mock("../../../../hooks/useWallet", () => ({ useWallet: () => useWallet() }));

test("home renders buckets, activity preview and a View all link", async () => {
  useWallet.mockReturnValue({ address: "GUSER", isConnected: true });
  const client = new MockVaultClient();
  await seedVault(client, "GUSER");
  render(<VaultProvider client={client}><HomePage /></VaultProvider>);
  await waitFor(() => expect(screen.getByText("USD bucket")).toBeInTheDocument());
  expect(screen.getByRole("button", { name: "Add funds" })).toBeInTheDocument();
  expect(screen.getByText("View all activity")).toBeInTheDocument();
  expect(screen.getByText("Your earning is paused")).toBeInTheDocument(); // EUR pool seeded frozen
});

test("tapping the freeze banner opens the exit approval sheet", async () => {
  useWallet.mockReturnValue({ address: "GUSER", isConnected: true, signTransaction: vi.fn(async (x: string) => x) });
  const client = new MockVaultClient();
  await seedVault(client, "GUSER");
  const user = userEvent.setup();
  render(<VaultProvider client={client}><HomePage /></VaultProvider>);

  await waitFor(() => expect(screen.getByText("Your earning is paused")).toBeInTheDocument());
  // `hidden: true` includes the aria-hidden (closed) sheet — getByRole excludes it otherwise.
  // Note: dom-accessibility-api's computeAccessibleName ignores the `hidden` query option for the
  // root node itself, so an aria-hidden root always resolves to name "" — match by role alone
  // (only one dialog renders on this page) and assert the label via the raw attribute instead.
  const dialog = screen.getByRole("dialog", { hidden: true });
  expect(dialog).toHaveAttribute("aria-label", "Approve safe exit");
  expect(dialog).toHaveAttribute("aria-hidden", "true");
  await user.click(screen.getByRole("button", { name: "Review paused pool" }));
  await waitFor(() => expect(dialog).toHaveAttribute("aria-hidden", "false"));
});
