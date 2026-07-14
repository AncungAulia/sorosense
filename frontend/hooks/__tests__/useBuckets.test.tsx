/**
 * `useBuckets` with the API **off** — the offline half of KTD4, and the regression fence for R11.
 *
 * With `NEXT_PUBLIC_API_URL` unset (this file, and every file in the suite bar the `*.api` ones) the
 * rows come from the vault seam plus `BUCKET_META` and the fixture FX, and **no request is issued**.
 * That is not a legacy path: in mock mode the browser's `MockVaultClient` and a mock-mode backend are
 * different in-memory instances, so a Home sourced over HTTP would render blank. The real-mode half is
 * in `useBuckets.api.test.tsx`.
 */
import { render, screen, waitFor } from "@testing-library/react";
import { MockVaultClient } from "@sorosense/vault-client";
import { VaultProvider } from "../../providers/VaultProvider";
import { seedVault } from "../../lib/vault/seed";
import { getBucketMeta, getFxRateToUsd } from "../../lib/vault/data";
import { UNIT } from "../../lib/vault/units";
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

/** Renders every field, so a row that silently changed shape cannot slip through. */
function FullProbe() {
  const { loading, buckets } = useBuckets();
  if (loading) return <span>loading</span>;
  return (
    <ul>
      {buckets.map((b) => (
        <li key={b.currency} data-testid={`row-${b.currency}`}>
          {b.name}|{b.venue}|{b.tags.join(",")}|{b.apy}|{b.value}|{b.valueUsd}
        </li>
      ))}
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

test("useBuckets refetches once the provider's background seed completes (no pre-seed)", async () => {
  useWallet.mockReturnValue({ address: "GUSER" });
  const client = new MockVaultClient();
  // Deliberately do NOT call seedVault here — VaultProvider seeds it asynchronously
  // on mount. This reproduces the seed-completion race: useBuckets must refetch
  // once the background seed finishes, not just read balances once on mount.
  render(<VaultProvider client={client}><Probe /></VaultProvider>);
  await waitFor(() => expect(screen.getByText("count:2")).toBeInTheDocument());
});

test("API off: every field is the seam's + BUCKET_META's + the fixture FX, and nothing is fetched", async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  useWallet.mockReturnValue({ address: "GUSER" });
  const client = new MockVaultClient();
  await seedVault(client, "GUSER");
  render(<VaultProvider client={client}><FullProbe /></VaultProvider>);

  await waitFor(() => expect(screen.getByTestId("row-USD")).toBeInTheDocument());

  // The row is derived, field by field, exactly as it was before `/holdings` existed.
  const usdValue = await client.assetValueOf("GUSER", "USD");
  const meta = getBucketMeta("USD");
  const expectedUsd = (Number(usdValue) / Number(UNIT)) * getFxRateToUsd("USD");
  expect(screen.getByTestId("row-USD").textContent).toBe(
    `${meta.name}|${meta.venue}|${meta.tags.join(",")}|${meta.apy}|${usdValue}|${expectedUsd}`,
  );

  // The offline guarantee: not one request left the app.
  expect(fetchMock).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});
