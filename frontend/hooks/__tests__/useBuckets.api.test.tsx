/**
 * `useBuckets` with the backend **enabled** — the real-mode half of KTD4 (R5).
 *
 * In real mode the browser and the backend read the same chain, so `GET /holdings` *is* the bucket row:
 * name, venue, tags, APY, shares, value, and the USD the backend blended with the live oracle. The
 * offline half — seam + `BUCKET_META` + the fixture FX, byte-for-byte — is pinned in `useBuckets.test.tsx`,
 * which (like the rest of the suite) runs with the var absent.
 *
 * `lib/api/config.ts` reads `NEXT_PUBLIC_API_URL` at module scope the way Next inlines it, so the var is
 * set in a `vi.hoisted` block — it runs before this file's imports.
 */
import { render, screen, waitFor } from "@testing-library/react";
import { MockVaultClient } from "@sorosense/vault-client";
import { VaultProvider } from "../../providers/VaultProvider";
import { seedVault } from "../../lib/vault/seed";
import { useBuckets } from "../useBuckets";

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_API_URL = "http://localhost:8787";
});
afterAll(() => {
  delete process.env.NEXT_PUBLIC_API_URL;
});

const useWallet = vi.fn();
vi.mock("../../hooks/useWallet", () => ({ useWallet: () => useWallet() }));

/**
 * A `GET /holdings` row as the backend sends it. Every display field differs from what the frontend
 * fixtures would produce, so a row that fell back to `BUCKET_META` could not pass as this one:
 *  - `name` "DeFindex USDC vault"  ≠ BUCKET_META's "USD bucket"
 *  - `apy` 8.20                    ≠ BUCKET_META's 8.59
 *  - `tags` carry "Lending"        ≠ BUCKET_META's ["DeFindex", "Vault"]
 */
const USD_ROW = {
  currency: "USD",
  name: "DeFindex USDC vault",
  venue: "DeFindex",
  kind: "vault",
  tags: ["DeFindex", "Lending"],
  apy: 8.2,
  shares: "10240000000",
  value: "11160000000",
  valueUsd: 1116,
  frozen: false,
};

/**
 * A EUR row. Its `valueUsd` (3435) is deliberately NOT `value × 1.08`, the frontend's hardcoded FX —
 * that is the whole point of R5: the backend blended it with a live Reflector read, and a frontend that
 * "helpfully" re-derives the number would overwrite a real oracle rate with a constant.
 */
const EUR_ROW = {
  currency: "EUR",
  name: "Blend EURC pool",
  venue: "Blend",
  kind: "lending",
  tags: ["Blend", "Fixed pool"],
  apy: 4.9,
  shares: "30000000000",
  value: "30000000000", // 3,000.00 EUR → ×1.08 would be 3240; the oracle said 3435
  valueUsd: 3435,
  frozen: true,
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

/** A fresh Response per call — a body reads once, and the hook refetches on a vault bump / poll. */
function holdingsAlways(body: unknown, status = 200) {
  return () =>
    Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
}

function Probe() {
  const { loading, buckets, totalUsd } = useBuckets();
  if (loading) return <span>loading</span>;
  return (
    <ul>
      <li data-testid="total">{totalUsd}</li>
      {buckets.map((b) => (
        <li key={b.currency} data-testid={`row-${b.currency}`}>
          {b.name}|{b.venue}|{b.tags.join(",")}|{b.apy}|{b.shares}|{b.value}|{b.valueUsd}|
          {b.frozen ? "frozen" : "active"}
        </li>
      ))}
    </ul>
  );
}

/** The browser's own mock vault is seeded throughout: in real mode it must not be what renders. */
async function renderFunded() {
  const client = new MockVaultClient();
  await seedVault(client, "GUSER");
  render(
    <VaultProvider client={client}>
      <Probe />
    </VaultProvider>,
  );
  return client;
}

test("a row's name, venue, tags and APY are the backend's — not BUCKET_META's", async () => {
  fetchMock.mockImplementation(holdingsAlways([USD_ROW]));
  await renderFunded();

  await waitFor(() => expect(screen.getByTestId("row-USD")).toBeInTheDocument());
  const usd = screen.getByTestId("row-USD").textContent!;
  expect(usd).toContain("DeFindex USDC vault|DeFindex|DeFindex,Lending|8.2|");
  expect(usd).not.toContain("USD bucket"); // the fixture name
  expect(usd).not.toContain("8.59"); // the fixture rate
});

test("valueUsd is the backend's blended number, never value × the hardcoded 1.08", async () => {
  fetchMock.mockImplementation(holdingsAlways([EUR_ROW]));
  await renderFunded();

  await waitFor(() => expect(screen.getByTestId("row-EUR")).toBeInTheDocument());
  const eur = screen.getByTestId("row-EUR").textContent!;
  expect(eur).toContain("|3435|"); // the oracle's USD, as sent
  expect(eur).not.toContain("|3240|"); // 3000 × 1.08 — the fixture FX, which must not be applied
  // And the blended headline is the sum of what the backend sent, not of what we recomputed.
  expect(screen.getByTestId("total").textContent).toBe("3435");
});

test("shares and value decode past Number.MAX_SAFE_INTEGER, exactly", async () => {
  // 9,007,199,254.7409919 base units — above 2^53-1, where Number() starts rounding. A bucket holding
  // ~900M units of a 7-dp asset reaches this, so it is arithmetic, not a hypothetical.
  const HUGE = "9007199254740993"; // 2^53 + 1: the first integer a double cannot represent
  fetchMock.mockImplementation(holdingsAlways([{ ...USD_ROW, shares: HUGE, value: HUGE }]));
  await renderFunded();

  await waitFor(() => expect(screen.getByTestId("row-USD")).toBeInTheDocument());
  const usd = screen.getByTestId("row-USD").textContent!;
  expect(usd).toContain(`|${HUGE}|${HUGE}|`);
  expect(usd).not.toContain("9007199254740992"); // what Number(HUGE) would have silently produced
});

test("the frozen flag comes from the backend's row", async () => {
  fetchMock.mockImplementation(holdingsAlways([USD_ROW, EUR_ROW]));
  await renderFunded();

  await waitFor(() => expect(screen.getByTestId("row-EUR")).toBeInTheDocument());
  expect(screen.getByTestId("row-EUR").textContent).toContain("frozen");
  expect(screen.getByTestId("row-USD").textContent).toContain("active");
});

test("a 503 read falls back to the seam and the fixtures — Home renders, and never blank", async () => {
  const logged = vi.spyOn(console, "error").mockImplementation(() => {});
  fetchMock.mockImplementation(
    holdingsAlways({ error: { code: "unavailable", message: "FX oracle unreachable" } }, 503),
  );
  await renderFunded(); // the seam holds USD + EUR

  await waitFor(() => expect(logged).toHaveBeenCalled());
  // The backend is dead, so the row is the seam's: the fixture name and the fixture rate, and a value
  // the backend never sent. A blank screen mid-demo is the failure this fallback exists to prevent.
  await waitFor(() => expect(screen.getByTestId("row-USD")).toBeInTheDocument());
  const usd = screen.getByTestId("row-USD").textContent!;
  expect(usd).toContain("USD bucket|DeFindex|");
  expect(usd).toContain("|8.59|");
  expect(Number(screen.getByTestId("total").textContent)).toBeGreaterThan(0);
});

test("no risk, label, score or tier field reaches a bucket row (safety is invisible)", async () => {
  // The backend carries none of these. If one ever appeared on the wire — a rogue field, a future
  // refactor — the row must drop it rather than pass it through to a user surface.
  fetchMock.mockImplementation(
    holdingsAlways([{ ...USD_ROW, risk: "high", label: "toxic", score: 3, tier: "C" }]),
  );

  function KeyProbe() {
    const { loading, buckets } = useBuckets();
    if (loading || !buckets[0]) return <span>loading</span>;
    return <span data-testid="keys">{Object.keys(buckets[0]).sort().join(",")}</span>;
  }
  const client = new MockVaultClient();
  await seedVault(client, "GUSER");
  render(
    <VaultProvider client={client}>
      <KeyProbe />
    </VaultProvider>,
  );

  await waitFor(() => expect(screen.getByTestId("keys")).toBeInTheDocument());
  expect(screen.getByTestId("keys").textContent).toBe(
    "apy,currency,frozen,name,shares,tags,value,valueUsd,venue",
  );
});
