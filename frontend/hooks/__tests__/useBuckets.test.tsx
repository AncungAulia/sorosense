import { render, screen, waitFor } from "@testing-library/react";
import { MockVaultClient } from "@sorosense/vault-client";
import { VaultProvider } from "../../providers/VaultProvider";
import { seedVault } from "../../lib/vault/seed";
import { useBuckets } from "../useBuckets";

const useWallet = vi.fn();
vi.mock("../../hooks/useWallet", () => ({ useWallet: () => useWallet() }));

function Probe() {
  const { loading, buckets, totalUsd } = useBuckets();
  if (loading) return <span>loading</span>;
  return (
    <ul>
      <li>count:{buckets.length}</li>
      <li>total:{Math.round(totalUsd)}</li>
      {buckets.map((b) => <li key={b.currency}>{b.currency}:{b.frozen ? "frozen" : "active"}</li>)}
    </ul>
  );
}

test("useBuckets lists funded buckets with frozen flag and a blended total", async () => {
  useWallet.mockReturnValue({ address: "GUSER" });
  const client = new MockVaultClient();
  await seedVault(client, "GUSER");
  render(<VaultProvider client={client}><Probe /></VaultProvider>);
  await waitFor(() => expect(screen.getByText("count:2")).toBeInTheDocument());
  expect(screen.getByText("EUR:frozen")).toBeInTheDocument();
  expect(screen.getByText("USD:active")).toBeInTheDocument();
});
