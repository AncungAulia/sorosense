import { render, screen, waitFor } from "@testing-library/react";
import {
  MockVaultClient,
  RealVaultClient,
  SHARE_PRICE_SCALE,
  type BindingsVaultClient,
} from "@sorosense/vault-client";
import { VaultProvider } from "../../providers/VaultProvider";
import { seedVault } from "../../lib/vault/seed";
import { useEarnings } from "../useEarnings";
import { resetContributions } from "../../lib/vault/contributions";
import { UNIT } from "../../lib/vault/units";

const useWallet = vi.fn();
vi.mock("../useWallet", () => ({ useWallet: () => useWallet() }));

function Probe() {
  const { loading, view } = useEarnings();
  if (loading) return <div>loading</div>;
  return (
    <div>
      <span data-testid="hasDeposit">{String(view.hasDeposit)}</span>
      <span data-testid="balanceUsd">{view.balanceUsd.toFixed(4)}</span>
      <span data-testid="earnedUsd">{view.earnedUsd.toFixed(4)}</span>
      <span data-testid="apy">{view.apy.toFixed(4)}</span>
      <span data-testid="bucketSum">{view.buckets.reduce((s, b) => s + b.usdValue, 0).toFixed(4)}</span>
      <span data-testid="chartLast">{(view.chart[view.chart.length - 1]?.earnedUsd ?? 0).toFixed(4)}</span>
      <span data-testid="monthlySum">{view.monthly.reduce((s, m) => s + m.earnedUsd, 0).toFixed(4)}</span>
      <span data-testid="monthlyLen">{view.monthly.length}</span>
    </div>
  );
}

async function renderFunded() {
  useWallet.mockReturnValue({ address: "GUSER", isConnected: true });
  const client = new MockVaultClient();
  await seedVault(client, "GUSER");
  render(<VaultProvider client={client}><Probe /></VaultProvider>);
  await waitFor(() => expect(screen.getByTestId("hasDeposit")).toBeInTheDocument());
}

test("R4 — per-bucket usdValue sums to balanceUsd", async () => {
  await renderFunded();
  expect(screen.getByTestId("bucketSum").textContent).toBe(screen.getByTestId("balanceUsd").textContent);
});

test("R5 — apy is value-weighted, not a plain mean", async () => {
  await renderFunded();
  // Seeded: USD (8.59% APY) holds more USD value than EUR (5.10%), so the weighted blend must sit
  // above the plain mean of 6.845.
  const apy = Number(screen.getByTestId("apy").textContent);
  expect(apy).toBeGreaterThan(5.1);
  expect(apy).toBeLessThan(8.59);
  expect(apy).not.toBeCloseTo((8.59 + 5.1) / 2, 3);
});

test("the chart's last point, the monthly sum, and earnedUsd are the same number", async () => {
  await renderFunded();
  const earned = screen.getByTestId("earnedUsd").textContent;
  expect(screen.getByTestId("chartLast").textContent).toBe(earned);
  expect(screen.getByTestId("monthlySum").textContent).toBe(earned);
  expect(screen.getByTestId("monthlyLen").textContent).toBe("9");
});

test("hasDeposit is false when nothing is deposited", async () => {
  useWallet.mockReturnValue({ address: null, isConnected: false });
  render(<VaultProvider client={new MockVaultClient()}><Probe /></VaultProvider>);
  await waitFor(() => expect(screen.getByTestId("hasDeposit").textContent).toBe("false"));
  expect(screen.getByTestId("earnedUsd").textContent).toBe("0.0000");
  expect(screen.getByTestId("apy").textContent).toBe("0.0000");
});

/**
 * R10 — the offline hybrid's guard, and why it survives U3.
 *
 * In real mode the backend supplies the true (zero) earned figure and this hybrid is never reached. But
 * the hybrid is also the **fallback** when a configured backend fails mid-demo — and in that state the
 * client is the real one while `getContributions` is still a browser-memory ledger that does not survive
 * a reload. `value − contributions` would then render the user's entire principal as profit: the exact
 * bug this plan kills on the backend, resurrected on the frontend's error path.
 *
 * So the hybrid derives earnings only for the client that recorded the ledger (the mock, which genuinely
 * accrues via `simulateYield`). For a real client it reports zero — which is also simply the fact, since
 * `share_price` is pinned to the scale until NAV accrual ships. "We cannot know" must never render as
 * "profit".
 *
 * The seam's real adapter is used for real (with an injected fake bindings client, so the test stays
 * offline) — not a stub of our own seam.
 */
function realClient(usdShares: bigint, usdValue: bigint): RealVaultClient {
  const read = <T,>(result: T) => Promise.resolve({ result });
  const isUsd = (c: { tag: string }) => c.tag === "Usd";
  const bindings = {
    balance_of: ({ currency }: { currency: { tag: string } }) => read(isUsd(currency) ? usdShares : 0n),
    value_of: ({ currency }: { currency: { tag: string } }) => read(isUsd(currency) ? usdValue : 0n),
    share_price: () => read(SHARE_PRICE_SCALE),
    // No keeper allocation yet — the state the live demo actually starts in (A5).
    active_pool: () => read(undefined),
    pool_status: () => read({ tag: "Active", values: undefined }),
    pending_exit: () => read(undefined),
    has_consent: () => read(true),
    auto_compound_enabled: () => read(true),
  };
  return new RealVaultClient({
    contractId: "CCONTRACT",
    rpcUrl: "https://rpc.invalid", // never reached: the bindings client is injected
    networkPassphrase: "Test SDF Network ; September 2015",
    client: bindings as unknown as BindingsVaultClient,
  });
}

test("offline fallback — an on-chain balance with an empty ledger reports earned = 0, not the principal", async () => {
  useWallet.mockReturnValue({ address: "GUSER", isConnected: true });
  resetContributions(); // nothing recorded this session — a reload, or a deposit made before it
  const client = realClient(100n * UNIT, 100n * UNIT);

  render(<VaultProvider client={client}><Probe /></VaultProvider>);

  await waitFor(() => expect(screen.getByTestId("hasDeposit").textContent).toBe("true"));
  // The balance is real and shown; this bucket is unallocated so its yield has not accrued (earned 0),
  // and the screen says so — the honest zero-state, not a fabricated-profit chart.
  expect(Number(screen.getByTestId("balanceUsd").textContent)).toBeGreaterThan(0);
  expect(screen.getByTestId("earnedUsd").textContent).toBe("0.0000");
  // The fabricated-profit regression: without the guard this is the whole $100 balance.
  expect(screen.getByTestId("chartLast").textContent).toBe("0.0000");
  expect(screen.getByTestId("monthlySum").textContent).toBe("0.0000");
});

test("real mode — a bucket with no active pool still renders (no keeper allocation yet, A5)", async () => {
  useWallet.mockReturnValue({ address: "GUSER", isConnected: true });
  const client = realClient(50n * UNIT, 50n * UNIT);

  render(<VaultProvider client={client}><Probe /></VaultProvider>);

  await waitFor(() => expect(screen.getByTestId("hasDeposit").textContent).toBe("true"));
  expect(screen.getByTestId("apy").textContent).not.toBe("0.0000"); // the advertised catalog rate
});

test("mock mode still derives earned from value − contributions", async () => {
  await renderFunded(); // seeded: simulateYield lifted NAV above the recorded contributions
  expect(Number(screen.getByTestId("earnedUsd").textContent)).toBeGreaterThan(0);
});
