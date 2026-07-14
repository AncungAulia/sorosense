/**
 * The APY seam (R5 · R13 · KTD3) with the backend **enabled**.
 *
 * Three sources, in strict order of authority, and this file owns the order:
 *  1. `GET /holdings` — a **funded** bucket, i.e. the pool the vault is actually in;
 *  2. `GET /rates`    — an **unfunded** bucket, which `getHoldings` omits by design (zero shares, no
 *     holding to report). The venue the agent *would* allocate it to;
 *  3. `BUCKET_META`   — only when the API is off or both reads failed (R11).
 *
 * The three rates are deliberately distinct (8.20 / 7.75 / 8.59 for USD), so a rendered number names its
 * own source and none can pass for another.
 *
 * `lib/api/config.ts` reads `NEXT_PUBLIC_API_URL` at module scope (Next inlines it at build time), so
 * the var is set in a `vi.hoisted` block — it runs before this file's imports, which is the only way to
 * have the real `apiEnabled()` see it without a second React copy from `vi.resetModules()`.
 *
 * The offline half of the contract (API unset ⇒ every surface renders the fixture, zero fetches) is
 * guarded by every *other* test file in the suite, which runs with the var absent — see
 * `earn-empty.test.tsx` asserting the 8.59% fixture hero.
 *
 * Scope: this file owns the **rate**. How `useBuckets` sources a whole row in real mode (KTD4) is pinned
 * next door, in `useBuckets.api.test.tsx`.
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
  apy: 8.2, // ← the funded rate; /rates says 7.75, BUCKET_META says 8.59
  shares: "10240000000",
  value: "11160000000",
  valueUsd: 1116,
  frozen: false,
};

/** `GET /rates` — one card per currency, user-independent. USD 7.75, EUR 4.25; the fixture says 8.59/5.10. */
const RATES = [
  { currency: "USD", name: "DeFindex USDC vault", venue: "DeFindex", kind: "vault", tags: ["DeFindex", "Vault"], apy: 7.75 },
  { currency: "EUR", name: "Blend EURC", venue: "Blend", kind: "lending", tags: ["Blend", "Fixed pool"], apy: 4.25 },
  { currency: "MXN", name: "Etherfuse CETES", venue: "Etherfuse", kind: "rwa", tags: ["Etherfuse", "CETES"], apy: 5.57 },
];

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

/**
 * Route each path to its own body — a mock that answered every request with the first body would let a
 * `/rates` read be satisfied by a holdings array and hide the very confusion this file exists to catch.
 * A fresh Response per call: a body can only be read once, and the hooks refetch on a vault bump.
 */
function routed(holdings: unknown, rates: unknown = RATES, status = 200) {
  return (input: RequestInfo | URL) => {
    const url = String(input);
    const body = url.includes("/rates") ? rates : holdings;
    return Promise.resolve(
      new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }),
    );
  };
}

const requestedPaths = (): string[] =>
  fetchMock.mock.calls.map(([input]) => new URL(String(input)).pathname);

function ApyProbe({ currency }: { currency: Currency }) {
  return <span data-testid="apy">{useApy(currency).toFixed(2)}</span>;
}

function renderProbe(currency: Currency) {
  render(
    <VaultProvider client={new MockVaultClient()}>
      <ApyProbe currency={currency} />
    </VaultProvider>,
  );
}

test("a funded bucket takes its APY from GET /holdings — not /rates, not the fixture", async () => {
  fetchMock.mockImplementation(routed([USD_ROW]));
  renderProbe("USD");

  // 8.20 is the pool the money is IN. 7.75 is the pool it would pick if it were unfunded; quoting that
  // for a funded bucket would misreport the rate the user is actually earning.
  await waitFor(() => expect(screen.getByTestId("apy").textContent).toBe("8.20"));
  expect(requestedPaths()).toContain(`/holdings`);
  expect(fetchMock.mock.calls.some(([u]) => String(u) === `${BASE}/holdings?depositor=GUSER`)).toBe(true);
});

test("an unfunded bucket has no /holdings row, so its APY comes from GET /rates — never the fixture", async () => {
  fetchMock.mockImplementation(routed([USD_ROW])); // no EUR row: EUR is unfunded (KTD3)
  renderProbe("EUR");

  await waitFor(() => expect(screen.getByTestId("apy").textContent).toBe("4.25")); // /rates, not 5.10
  const rendered = screen.getByTestId("apy").textContent;
  expect(rendered).not.toMatch(/NaN|^0\.00$|^$/);
  expect(requestedPaths()).toContain("/rates");
});

test("an unfunded bucket's rate never comes from a funded bucket's row", async () => {
  fetchMock.mockImplementation(routed([USD_ROW])); // USD funded, EUR not
  renderProbe("EUR");

  await waitFor(() => expect(screen.getByTestId("apy").textContent).toBe("4.25"));
  expect(screen.getByTestId("apy").textContent).not.toBe("8.20"); // not USD's rate
});

test("a /holdings read that 502s still quotes /rates — the fixture is not reached while the API answers", async () => {
  const logged = vi.spyOn(console, "error").mockImplementation(() => {});
  // The 502 is on /holdings only — /rates is a pure catalog read with no vault to fail on, which is
  // precisely why a failed holdings read should not drop the whole surface back to a 2026 constant.
  fetchMock.mockImplementation((input: RequestInfo | URL) => {
    const url = String(input);
    return url.includes("/rates")
      ? Promise.resolve(
          new Response(JSON.stringify(RATES), { status: 200, headers: { "content-type": "application/json" } }),
        )
      : Promise.resolve(
          new Response(JSON.stringify({ error: { code: "unavailable", message: "vault read failed" } }), {
            status: 502,
            headers: { "content-type": "application/json" },
          }),
        );
  });
  renderProbe("USD");

  await waitFor(() => expect(logged).toHaveBeenCalled());
  await waitFor(() => expect(screen.getByTestId("apy").textContent).toBe("7.75")); // /rates, not 8.59
});

test("both reads down ⇒ the documented fixture, logged — never a blank or NaN (R11)", async () => {
  const logged = vi.spyOn(console, "error").mockImplementation(() => {});
  fetchMock.mockRejectedValue(new TypeError("Failed to fetch")); // backend gone entirely
  renderProbe("USD");

  await waitFor(() => expect(logged).toHaveBeenCalled());
  await waitFor(() => expect(screen.getByTestId("apy").textContent).toBe("8.59")); // BUCKET_META
});
