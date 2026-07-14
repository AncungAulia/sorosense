import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockVaultClient } from "@sorosense/vault-client";
import { VaultProvider } from "../../../providers/VaultProvider";
import { ToastProvider } from "../../../providers/ToastProvider";
import { DepositKeypad } from "../DepositKeypad";
import { getContributions, resetContributions } from "../../../lib/vault/contributions";
import { UNIT } from "../../../lib/vault/units";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, back: vi.fn() }) }));
const useWallet = vi.fn();
vi.mock("../../../hooks/useWallet", () => ({ useWallet: () => useWallet() }));

/** The offline default: no NEXT_PUBLIC_API_URL, no Horizon env — every network branch is dead. */
const fetchSpy = vi.fn();

function setup(sym: string) {
  const sign = vi.fn(async (xdr: string) => `sig:${xdr}`);
  useWallet.mockReturnValue({ address: "GNEW", isConnected: true, signTransaction: sign });
  const client = new MockVaultClient(); // fresh: hasConsent=false → consent required
  vi.stubGlobal("fetch", fetchSpy);
  render(<VaultProvider client={client}><ToastProvider><DepositKeypad sym={sym} /></ToastProvider></VaultProvider>);
  return { sign, client };
}

afterEach(() => {
  fetchSpy.mockClear();
  vi.unstubAllGlobals();
  resetContributions(); // the ledger is a module singleton — keep each test's cost basis its own
});

test("no risk-tier control is present", () => {
  setup("usdc");
  expect(screen.queryByText(/conservative|balanced|risk|tier/i)).not.toBeInTheDocument();
});

test("with no Horizon env the fixture balance renders, no faucet button, and nothing is fetched", async () => {
  setup("usdc");
  // The offline guarantee: neither the Horizon read nor the faucet exists without their env vars.
  expect(screen.getByText("$9,076.00")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Get test/ })).toBeNull();
  await waitFor(() => expect(screen.getByRole("button", { name: "Deposit fund" })).toBeInTheDocument());
  expect(fetchSpy).not.toHaveBeenCalled();
});

test("unknown sym shows a not-found state instead of defaulting to USD", () => {
  setup("xyz");
  expect(screen.queryByRole("button", { name: "Deposit fund" })).not.toBeInTheDocument();
  expect(screen.getByText(/unknown asset/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Choose an asset" })).toBeInTheDocument();
});

test("blocks deposit when the amount exceeds the wallet balance", async () => {
  const user = userEvent.setup();
  setup("usdc"); // USDC wallet fixture is 9,076
  for (const d of "99999") await user.click(screen.getByRole("button", { name: d }));
  expect(screen.getByText(/not enough balance/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Deposit fund" })).toBeDisabled();
});

test("first deposit signs consent then deposit (two signatures)", async () => {
  const user = userEvent.setup();
  const { sign, client } = setup("usdc");
  await user.click(screen.getByRole("button", { name: "1" }));
  await user.click(screen.getByRole("button", { name: "0" }));
  await user.click(screen.getByRole("button", { name: "Deposit fund" }));
  // consent sheet appears
  await user.click(screen.getByRole("button", { name: /agree & sign/i }));
  await waitFor(() => expect(sign).toHaveBeenCalledTimes(2)); // consent + deposit
  await waitFor(async () => expect(await client.balanceOf("GNEW", "USD")).toBeGreaterThan(0n));
  // Success is a status screen, not an auto-redirect — the user taps Done to return home.
  await waitFor(() => expect(screen.getByText("Deposit sent")).toBeInTheDocument());
  await user.click(screen.getByRole("button", { name: "Done" }));
  expect(push).toHaveBeenCalledWith("/home");
});

/**
 * R5 / KTD4 — the seam resolves a chain-rejected write as `success: false` instead of throwing, so
 * awaiting one proves nothing. `simulateFailure()` is the mock's honest stand-in for that (no
 * hand-patched `signAndSubmit`): the UI must show a failure, record no cost basis, and never say
 * "sent". Each test settles the dev seed first, so the assertions read a deposit's effect and not the
 * seed's still-in-flight one.
 */
async function settledSeed(client: MockVaultClient) {
  await waitFor(async () => expect(await client.balanceOf("GNEW", "USD")).toBeGreaterThan(0n));
  return { shares: await client.balanceOf("GNEW", "USD"), basis: getContributions("USD") };
}

async function enterTen(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "1" }));
  await user.click(screen.getByRole("button", { name: "0" }));
  await user.click(screen.getByRole("button", { name: "Deposit fund" }));
  await user.click(screen.getByRole("button", { name: /agree & sign/i })); // consent, then deposit
}

test("a rejected deposit shows a failure — no cost basis, no success screen", async () => {
  const user = userEvent.setup();
  const { client } = setup("usdc");
  const before = await settledSeed(client);
  client.simulateFailure();

  await enterTen(user);

  await waitFor(() => expect(screen.getByText("Couldn't complete")).toBeInTheDocument());
  expect(screen.queryByText("Deposit sent")).toBeNull();
  expect(await client.balanceOf("GNEW", "USD")).toBe(before.shares); // nothing minted
  expect(getContributions("USD")).toBe(before.basis); // recordDeposit never ran
});

test("a rejected consent stops the chain — the deposit is never attempted", async () => {
  const user = userEvent.setup();
  const { sign, client } = setup("usdc");
  await settledSeed(client);
  client.simulateFailure();
  const deposit = vi.spyOn(client, "deposit");

  await enterTen(user);

  await waitFor(() => expect(screen.getByText("Couldn't complete")).toBeInTheDocument());
  // Depositing on a mandate that never landed is the chain's NoConsent panic. Don't go there.
  expect(deposit).not.toHaveBeenCalled();
  expect(sign).toHaveBeenCalledTimes(1); // the consent signature, and nothing after it
});

test("the happy path still records cost basis exactly once", async () => {
  const user = userEvent.setup();
  const { client } = setup("usdc");
  const before = await settledSeed(client);

  await enterTen(user);

  await waitFor(() => expect(screen.getByText("Deposit sent")).toBeInTheDocument());
  expect(getContributions("USD") - before.basis).toBe(10n * UNIT);
  expect(await client.balanceOf("GNEW", "USD")).toBeGreaterThan(before.shares);
});
