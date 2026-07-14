/**
 * The APY seam (R5 · KTD3) with the backend **enabled**.
 *
 * `lib/api/config.ts` reads `NEXT_PUBLIC_API_URL` at module scope (Next inlines it at build time), so
 * the var is set in a `vi.hoisted` block — it runs before this file's imports, which is the only way to
 * have the real `apiEnabled()` see it without a second React copy from `vi.resetModules()`.
 *
 * The offline half of the contract (API unset ⇒ every surface renders the fixture, zero fetches) is
 * guarded by every *other* test file in the suite, which runs with the var absent — see
 * `earn-empty.test.tsx` asserting the 8.59% fixture hero.
 *
 * Scope: this file owns the **rate**, i.e. what `useApy` resolves for a bucket with or without a
 * `/holdings` row. How `useBuckets` sources a whole row in real mode (KTD4) is pinned next door, in
 * `useBuckets.api.test.tsx`.
 */
import { render, screen, waitFor } from "@testing-library/react";
import { MockVaultClient } from "@sorosense/vault-client";
import type { Currency } from "@sorosense/vault-client";
import { VaultProvider } from "../../providers/VaultProvider";
import { useApy } from "../useApy";

const BASE = "http://localhost:8787";
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_API_URL = "http://localhost:8787";
});
afterAll(() => {
  delete process.env.NEXT_PUBLIC_API_URL;
});

const useWallet = vi.fn();
vi.mock("../../hooks/useWallet", () => ({ useWallet: () => useWallet() }));

/** A `GET /holdings` row as the backend sends it — bigints are decimal strings on the wire. */
const USD_ROW = {
  currency: "USD",
  name: "DeFindex USDC vault",
  venue: "DeFindex",
  kind: "vault",
  tags: ["DeFindex", "Vault"],
  apy: 8.2, // ← the backend's rate; BUCKET_META says 8.59
  shares: "10240000000",
  value: "11160000000",
  valueUsd: 1116,
  frozen: false,
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  useWallet.mockReturnValue({ address: "GUSER", isConnected: true });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** A fresh Response per call — a body can only be read once, and the hook refetches on a vault bump. */
function holdingsAlways(body: unknown, status = 200) {
  return () =>
    Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
}

function ApyProbe({ currency }: { currency: Currency }) {
  return <span data-testid="apy">{useApy(currency).toFixed(2)}</span>;
}

test("a funded bucket takes its APY from GET /holdings, not the fixture", async () => {
  fetchMock.mockImplementation(holdingsAlways([USD_ROW]));
  render(
    <VaultProvider client={new MockVaultClient()}>
      <ApyProbe currency="USD" />
    </VaultProvider>,
  );

  await waitFor(() => expect(screen.getByTestId("apy").textContent).toBe("8.20"));
  const [url] = fetchMock.mock.calls[0] as [string];
  expect(url).toBe(`${BASE}/holdings?depositor=GUSER`);
});

test("an unfunded bucket has no /holdings row and keeps the fixture rate — never NaN or 0.00", async () => {
  fetchMock.mockImplementation(holdingsAlways([USD_ROW])); // no EUR row: EUR is unfunded (KTD3)
  render(
    <VaultProvider client={new MockVaultClient()}>
      <ApyProbe currency="EUR" />
    </VaultProvider>,
  );

  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  const rendered = screen.getByTestId("apy").textContent;
  expect(rendered).toBe("5.10"); // BUCKET_META.EUR
  expect(rendered).not.toMatch(/NaN|^0\.00$|^$/);
});

test("a /holdings read that 502s falls back to the fixture, logs, and still renders", async () => {
  const logged = vi.spyOn(console, "error").mockImplementation(() => {});
  fetchMock.mockImplementation(
    holdingsAlways({ error: { code: "unavailable", message: "vault read failed" } }, 502),
  );
  render(
    <VaultProvider client={new MockVaultClient()}>
      <ApyProbe currency="USD" />
    </VaultProvider>,
  );

  await waitFor(() => expect(logged).toHaveBeenCalled());
  expect(screen.getByTestId("apy").textContent).toBe("8.59"); // the fixture, not a blank
});

test("an unfunded bucket's rate never comes from a funded bucket's row", async () => {
  fetchMock.mockImplementation(holdingsAlways([USD_ROW])); // USD funded, EUR not
  render(
    <VaultProvider client={new MockVaultClient()}>
      <ApyProbe currency="EUR" />
    </VaultProvider>,
  );

  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  expect(screen.getByTestId("apy").textContent).toBe("5.10"); // EUR's fixture, not USD's 8.20
});
