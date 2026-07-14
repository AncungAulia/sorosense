/**
 * `useEarnings` with the backend **enabled** — the real-mode half of the Earn screen (R8 · R10 · R11).
 *
 * In real mode the backend has already done every piece of arithmetic this hook used to do in the
 * browser: it reconstructs cost basis from decoded chain events (which survive a reload, unlike
 * `lib/vault/contributions.ts`) and blends to USD with the live Reflector rate. So the response **is**
 * the view, and this file's job is to prove the frontend adds nothing to it.
 *
 * The offline half — seam + `contributions.ts` + `buildEarningsFixture` — is pinned in
 * `useEarnings.test.tsx`, which (like the rest of the suite) runs with the var absent.
 *
 * `lib/api/config.ts` reads `NEXT_PUBLIC_API_URL` at module scope the way Next inlines it, so the var is
 * set in a `vi.hoisted` block — it runs before this file's imports.
 */
import { render, screen, waitFor } from "@testing-library/react";
import { MockVaultClient, type Currency } from "@sorosense/vault-client";
import { VaultProvider } from "../../providers/VaultProvider";
import { seedVault } from "../../lib/vault/seed";
import { useEarnings } from "../useEarnings";

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_API_URL = "http://localhost:8787";
});
afterAll(() => {
  delete process.env.NEXT_PUBLIC_API_URL;
});

const useWallet = vi.fn();
vi.mock("../useWallet", () => ({ useWallet: () => useWallet() }));

/**
 * The browser-memory cost-basis ledger. In real mode it must not be **touched**: consulting it is the
 * re-derivation R8 removes, and its answer (empty after a reload) is what reported a user's whole
 * principal as profit. The module stays real — deposits still record — but every read is counted.
 */
const readLedger = vi.fn();
vi.mock("../../lib/vault/contributions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/vault/contributions")>();
  return {
    ...actual,
    getContributions: (currency: Currency) => {
      readLedger(currency);
      return actual.getContributions(currency);
    },
  };
});

/**
 * `GET /earnings` as the live backend sends it today: a real balance, a real value timeline that
 * **steps** on the deposit — and `earnedUsd` of exactly **0**, at the headline, in every chart point and
 * in every month. The vault does not accrue on-chain yet (`share_price` reads exactly
 * `SHARE_PRICE_SCALE`), so zero is the truth, and any nonzero number here would mean a mock leaked back
 * into the real path.
 */
const ZERO_YIELD = {
  hasDeposit: true,
  balanceUsd: 4551, // 1116 USD + 3435 USD-equivalent of the EUR bucket, blended by the live oracle
  apy: 5.71,
  earnedUsd: 0,
  buckets: [
    { currency: "USD", nativeValue: "11160000000", usdValue: 1116, earnedUsd: 0 },
    { currency: "EUR", nativeValue: "30000000000", usdValue: 3435, earnedUsd: 0 },
  ],
  chart: [
    { ts: 1_700_000_000_000, valueUsd: 0, earnedUsd: 0 },
    { ts: 1_700_000_600_000, valueUsd: 4551, earnedUsd: 0 }, // the deposit: value steps, earned does not
  ],
  monthly: [
    { label: "2026-06", earnedUsd: 0 },
    { label: "2026-07", earnedUsd: 0 },
  ],
};

/** The matching `//holdings` rows — the Home surface reads these; `useEarnings` must not. */
const HOLDINGS = [
  {
    currency: "USD", name: "DeFindex USDC vault", venue: "DeFindex", kind: "vault",
    tags: ["DeFindex", "Vault"], apy: 8.2, shares: "10240000000", value: "11160000000",
    valueUsd: 1116, frozen: false,
  },
  {
    currency: "EUR", name: "Blend EURC pool", venue: "Blend", kind: "lending",
    tags: ["Blend", "Fixed pool"], apy: 4.9, shares: "30000000000", value: "30000000000",
    valueUsd: 3435, frozen: false,
  },
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
  readLedger.mockClear();
});

/**
 * The Earn surface reads two routes — answer each with its own shape rather than with whichever body
 * the test happened to care about. A fresh `Response` per call: a body reads once, and the hooks refetch
 * on a vault bump / poll.
 */
function serve(earnings: unknown, { holdings = HOLDINGS as unknown, status = 200 } = {}) {
  return (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    const body = url.includes("/earnings") ? earnings : holdings;
    return Promise.resolve(
      new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }),
    );
  };
}

function Probe() {
  const { loading, view } = useEarnings();
  if (loading) return <span>loading</span>;
  return (
    <div>
      <span data-testid="hasDeposit">{String(view.hasDeposit)}</span>
      <span data-testid="balanceUsd">{view.balanceUsd}</span>
      <span data-testid="apy">{view.apy}</span>
      <span data-testid="earnedUsd">{view.earnedUsd}</span>
      <span data-testid="buckets">
        {view.buckets.map((b) => `${b.currency}:${b.nativeValue}:${b.usdValue}:${b.earnedUsd}`).join("|")}
      </span>
      <span data-testid="chart">{view.chart.map((p) => `${p.ts}:${p.valueUsd}:${p.earnedUsd}`).join("|")}</span>
      <span data-testid="monthly">{view.monthly.map((m) => `${m.label}:${m.earnedUsd}`).join("|")}</span>
    </div>
  );
}

/** The browser's own mock vault is seeded throughout: in real mode it must not be what renders. */
async function renderFunded() {
  const client = new MockVaultClient();
  await seedVault(client, "GUSER"); // the mock DOES accrue (simulateYield) — so a leak would be visible
  render(
    <VaultProvider client={client}>
      <Probe />
    </VaultProvider>,
  );
}

test("the view is the backend's response, verbatim — nothing is re-derived in the browser", async () => {
  fetchMock.mockImplementation(serve(ZERO_YIELD));
  await renderFunded();

  await waitFor(() => expect(screen.getByTestId("hasDeposit")).toBeInTheDocument());
  expect(screen.getByTestId("balanceUsd").textContent).toBe("4551");
  expect(screen.getByTestId("apy").textContent).toBe("5.71");
  // `nativeValue` arrives as a decimal string and is decoded with `toBigInt` — the one transformation.
  expect(screen.getByTestId("buckets").textContent).toBe("USD:11160000000:1116:0|EUR:30000000000:3435:0");
  expect(screen.getByTestId("chart").textContent).toBe("1700000000000:0:0|1700000600000:4551:0");
  expect(screen.getByTestId("monthly").textContent).toBe("2026-06:0|2026-07:0");

  // The seeded mock vault holds a *different*, accruing balance, and `/holdings` a different APY (8.2%
  // / 4.9%). Neither reached this view — the response did…
  expect(screen.getByTestId("apy").textContent).not.toBe("8.2");
  // …and the browser-memory cost basis was never even read.
  expect(readLedger).not.toHaveBeenCalled();
});

test("zero yield stays zero — the headline, every month, and every chart point (R10)", async () => {
  fetchMock.mockImplementation(serve(ZERO_YIELD));
  await renderFunded();

  await waitFor(() => expect(screen.getByTestId("earnedUsd")).toBeInTheDocument());
  // The mock accrues, so a nonzero here is the specific regression: a fixture leaking into real mode.
  expect(screen.getByTestId("earnedUsd").textContent).toBe("0");
  expect(screen.getByTestId("monthly").textContent).toBe("2026-06:0|2026-07:0");
  expect(screen.getByTestId("chart").textContent).not.toMatch(/:[1-9]\d*$/m);
  expect(readLedger).not.toHaveBeenCalled();
});

test("the value timeline steps on the deposit while earned stays flat — that is the real chart", async () => {
  fetchMock.mockImplementation(serve(ZERO_YIELD));
  await renderFunded();

  await waitFor(() => expect(screen.getByTestId("chart")).toBeInTheDocument());
  const points = screen.getByTestId("chart").textContent!.split("|").map((p) => p.split(":").map(Number));
  expect(points.map((p) => p[1])).toEqual([0, 4551]); // valueUsd: a step, on real money
  expect(points.map((p) => p[2])).toEqual([0, 0]); // earnedUsd: flat, because nothing accrued
});

test("a failed read falls back to the offline hybrid — the Earn screen renders, never blank", async () => {
  const logged = vi.spyOn(console, "error").mockImplementation(() => {});
  // The backend is down, so *both* reads fail — the state a demo actually lands in.
  const down = { error: { code: "unavailable", message: "FX oracle unreachable" } };
  fetchMock.mockImplementation(serve(down, { holdings: down, status: 503 }));
  await renderFunded(); // the seam holds the seeded, accruing buckets

  await waitFor(() => expect(logged).toHaveBeenCalled());
  await waitFor(() => expect(screen.getByTestId("hasDeposit").textContent).toBe("true"));
  // The backend is dead, so this is the mock's own view: a balance, and the yield the mock genuinely
  // accrued. The fallback consults the cost-basis ledger — which, for the mock, is a real one.
  expect(Number(screen.getByTestId("balanceUsd").textContent)).toBeGreaterThan(0);
  expect(Number(screen.getByTestId("earnedUsd").textContent)).toBeGreaterThan(0);
  expect(readLedger).toHaveBeenCalled();
});

test("a 200 that is not an earnings view is a failed read, not a crashed render", async () => {
  const logged = vi.spyOn(console, "error").mockImplementation(() => {});
  // A base URL pointed at some other JSON service. `client.ts` guarantees the body parses as JSON; only
  // this hook knows it was supposed to be an earnings view, so the shape check — and the fallback — live
  // here. Without it this is `undefined.map` thrown straight into a render.
  fetchMock.mockImplementation(serve({ totally: "different" }));
  await renderFunded();

  await waitFor(() => expect(logged).toHaveBeenCalled());
  await waitFor(() => expect(screen.getByTestId("hasDeposit").textContent).toBe("true"));
  expect(Number(screen.getByTestId("balanceUsd").textContent)).toBeGreaterThan(0);
});
