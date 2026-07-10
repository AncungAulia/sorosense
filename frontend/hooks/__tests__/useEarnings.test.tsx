import { render, screen, waitFor } from "@testing-library/react";
import { MockVaultClient } from "@sorosense/vault-client";
import { VaultProvider } from "../../providers/VaultProvider";
import { seedVault } from "../../lib/vault/seed";
import { useEarnings } from "../useEarnings";

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
