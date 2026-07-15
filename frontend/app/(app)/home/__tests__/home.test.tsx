import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockVaultClient } from "@sorosense/vault-client";
import { VaultProvider } from "../../../../providers/VaultProvider";
import { ToastProvider } from "../../../../providers/ToastProvider";
import { seedVault } from "../../../../lib/vault/seed";
import HomePage from "../page";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/home",
  useSearchParams: () => new URLSearchParams(""),
}));
const useWallet = vi.fn();
vi.mock("../../../../hooks/useWallet", () => ({ useWallet: () => useWallet() }));
const isDesktop = vi.fn(() => false);
vi.mock("../../../../hooks/useIsDesktop", () => ({ useIsDesktop: () => isDesktop() }));

test("home renders buckets, activity preview and a View all link", async () => {
  useWallet.mockReturnValue({ address: "GUSER", isConnected: true });
  const client = new MockVaultClient();
  await seedVault(client, "GUSER");
  render(<VaultProvider client={client}><ToastProvider><HomePage /></ToastProvider></VaultProvider>);
  await waitFor(() => expect(screen.getByText("USD Bucket")).toBeInTheDocument());
  expect(screen.getByRole("button", { name: "Deposit" })).toBeInTheDocument();
  expect(screen.getByText("View all activity")).toBeInTheDocument();
  expect(screen.getByText("Your earning is paused")).toBeInTheDocument(); // EUR pool seeded frozen
});

test("mobile Agent preview hides View all until there are more than three agent rows", async () => {
  useWallet.mockReturnValue({ address: null, isConnected: false });
  render(<VaultProvider client={new MockVaultClient()}><ToastProvider><HomePage /></ToastProvider></VaultProvider>);

  await waitFor(() => expect(screen.getByText("No deposits yet")).toBeInTheDocument());
  expect(screen.getByText("No agent activity yet")).toBeInTheDocument();
  expect(screen.queryByText("View all activity")).toBeNull();
});

test("tapping the freeze banner opens the exit approval sheet", async () => {
  useWallet.mockReturnValue({ address: "GUSER", isConnected: true, signTransaction: vi.fn(async (x: string) => x) });
  const client = new MockVaultClient();
  await seedVault(client, "GUSER");
  const user = userEvent.setup();
  render(<VaultProvider client={client}><ToastProvider><HomePage /></ToastProvider></VaultProvider>);

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

test("desktop hero: eyebrow, flat Total segmented pressed, 'Earned this month' sub-stat, no risk words", async () => {
  isDesktop.mockReturnValue(true);
  useWallet.mockReturnValue({ address: "GUSER", isConnected: true });
  const client = new MockVaultClient();
  await seedVault(client, "GUSER");
  render(<VaultProvider client={client}><ToastProvider><HomePage /></ToastProvider></VaultProvider>);

  await waitFor(() => expect(screen.getByText(/your value/i)).toBeInTheDocument());
  const total = screen.getByRole("button", { name: "Total" });
  expect(total).toHaveAttribute("aria-pressed", "true");
  expect(total).not.toHaveClass("bg-white"); // flat segmented, not a white raised pill
  expect(screen.getByText(/Earned this month/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Deposit" })).toBeInTheDocument();
  // ExitApproval's own copy legitimately says "safe exit" (invisible-safety wording); it's mounted
  // but aria-hidden (sheet closed), so scope this check to the visible page, not the hidden dialog.
  expect(screen.queryByText(/\b(risk|score|Safe|Watch|Sentinel)\b/i, { ignore: '[aria-hidden="true"] *' })).toBeNull();
  isDesktop.mockReturnValue(false); // reset for any later test
});

test("desktop bottom row: Buckets, Growth (green bars), Agent; banner shows on frozen seed", async () => {
  isDesktop.mockReturnValue(true);
  useWallet.mockReturnValue({ address: "GUSER", isConnected: true });
  const client = new MockVaultClient();
  await seedVault(client, "GUSER"); // seeds a frozen EUR pool
  render(<VaultProvider client={client}><ToastProvider><HomePage /></ToastProvider></VaultProvider>);

  await waitFor(() => expect(screen.getByRole("heading", { name: "Buckets" })).toBeInTheDocument());
  expect(screen.getByRole("heading", { name: "Growth" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Agent" })).toBeInTheDocument();
  expect(screen.getAllByTestId("bars").length).toBeGreaterThan(0); // green Bars rendered
  expect(screen.getByText(/your earning is paused/i)).toBeInTheDocument(); // frozen → banner
  isDesktop.mockReturnValue(false);
});

test("desktop FreezeBanner is hidden when nothing is frozen", async () => {
  isDesktop.mockReturnValue(true);
  useWallet.mockReturnValue({ address: "GEMPTY", isConnected: true });
  const client = new MockVaultClient(); // no seed → no frozen pool
  render(<VaultProvider client={client}><ToastProvider><HomePage /></ToastProvider></VaultProvider>);

  await waitFor(() => expect(screen.getByRole("heading", { name: "Buckets" })).toBeInTheDocument());
  expect(screen.queryByText(/your earning is paused/i)).toBeNull(); // no banner when not pending
  isDesktop.mockReturnValue(false);
});

test("desktop shows loading skeletons before data resolves, and none after", async () => {
  isDesktop.mockReturnValue(true);
  useWallet.mockReturnValue({ address: "GUSER", isConnected: true });
  const client = new MockVaultClient();
  await seedVault(client, "GUSER");
  render(<VaultProvider client={client}><ToastProvider><HomePage /></ToastProvider></VaultProvider>);
  // First render: useBuckets is still loading → skeletons stand in for value/chart/buckets/growth.
  expect(screen.getAllByTestId("skeleton").length).toBeGreaterThan(0);
  // Once the reads resolve, the skeletons are gone.
  await waitFor(() => expect(screen.getByRole("heading", { name: "Buckets" })).toBeInTheDocument());
  await waitFor(() => expect(screen.queryAllByTestId("skeleton")).toHaveLength(0));
  isDesktop.mockReturnValue(false);
});
