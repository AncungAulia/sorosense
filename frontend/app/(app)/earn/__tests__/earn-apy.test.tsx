/**
 * Earn's APY surfaces with the backend **enabled** (R5 · R13 · KTD3).
 *
 * Two routes feed one number, and which one wins is the whole contract:
 *  - a **funded** bucket's rate is its `GET /holdings` row — the pool the vault is actually in;
 *  - an **unfunded** bucket's (the empty-state hero, the simulator) is `GET /rates` — the venue the
 *    agent *would* allocate it to. It used to be `BUCKET_META`, which is the leak U4 closes.
 *
 * So the three rates below are deliberately all different (8.20 holdings / 7.75 rates / 8.59 fixture):
 * whichever renders names its own source, and none can pass for another.
 *
 * The offline half — API unset ⇒ the 8.59%/5.10% fixtures on every surface, zero requests — is what
 * `earn-empty.test.tsx` and the rest of the suite already guard; they all run with the var absent.
 * Here `NEXT_PUBLIC_API_URL` is set in a `vi.hoisted` block (it must land before `lib/api/config.ts` is
 * imported, which reads it at module scope the way Next inlines it).
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockVaultClient } from "@sorosense/vault-client";
import { VaultProvider } from "../../../../providers/VaultProvider";
import { seedVault } from "../../../../lib/vault/seed";
import EarnPage from "../page";

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_API_URL = "http://localhost:8787";
});
afterAll(() => {
  delete process.env.NEXT_PUBLIC_API_URL;
});

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
const useWallet = vi.fn();
vi.mock("../../../../hooks/useWallet", () => ({ useWallet: () => useWallet() }));

/** The backend's USD row: 8.20% — the fixture says 8.59%, so the two are never confusable. */
const USD_ROW = {
  currency: "USD",
  name: "DeFindex USDC vault",
  venue: "DeFindex",
  kind: "vault",
  tags: ["DeFindex", "Vault"],
  apy: 8.2,
  shares: "10240000000",
  value: "11160000000",
  valueUsd: 1116,
  frozen: false,
};

/** The backend's EUR row: 4.90% — the fixture says 5.10%. */
const EUR_ROW = {
  currency: "EUR",
  name: "Blend EURC pool",
  venue: "Blend",
  kind: "lending",
  tags: ["Blend", "Fixed pool"],
  apy: 4.9,
  shares: "3000000000",
  value: "3000000000",
  valueUsd: 3435,
  frozen: true,
};

const MXN_ROW = {
  currency: "MXN",
  name: "Etherfuse CETES",
  venue: "Etherfuse",
  kind: "rwa",
  tags: ["Etherfuse", "CETES"],
  apy: 5.57,
  shares: "0",
  value: "0",
  valueUsd: 0,
  frozen: false,
};

type Row = typeof USD_ROW;

/**
 * `GET /rates` — the rate card for a bucket with no `/holdings` row. Its figures match neither the
 * holdings rows (8.20 / 4.90) nor `BUCKET_META` (8.59 / 5.10), so a hero quoting 7.75% can only have
 * read this route, and one quoting 8.59% can only have fallen back to the fixture.
 */
const RATES = [
  { currency: "USD", name: "DeFindex USDC vault", venue: "DeFindex", kind: "vault", tags: ["DeFindex", "Vault"], apy: 7.75 },
  { currency: "EUR", name: "Blend EURC", venue: "Blend", kind: "lending", tags: ["Blend", "Fixed pool"], apy: 4.25 },
  { currency: "MXN", name: "Etherfuse CETES", venue: "Etherfuse", kind: "rwa", tags: ["Etherfuse", "CETES"], apy: 5.57 },
];

/**
 * `GET /earnings` for the same rows, as the live backend would send it: `earnedUsd` is **0**, because
 * `share_price` is pinned to the scale until NAV accrual ships (R10). The per-bucket rates asserted
 * below therefore have to come from the `/holdings` rows — this response carries none.
 */
function earningsFor(rows: Row[]) {
  const balanceUsd = rows.reduce((s, r) => s + r.valueUsd, 0);
  return {
    hasDeposit: rows.length > 0,
    balanceUsd,
    apy: balanceUsd > 0 ? rows.reduce((s, r) => s + r.valueUsd * r.apy, 0) / balanceUsd : 0,
    earnedUsd: 0,
    buckets: rows.map((r) => ({ currency: r.currency, nativeValue: r.value, usdValue: r.valueUsd, earnedUsd: 0 })),
    chart: [],
    monthly: [],
  };
}

/** The Earn page reads three routes now — answer each with its own shape, not with whatever came first. */
function routeTo(rows: Row[]) {
  return (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    const body = url.includes("/earnings") ? earningsFor(rows) : url.includes("/rates") ? RATES : rows;
    // A fresh Response per call: a body can only be read once, and the hooks refetch on a vault bump.
    return Promise.resolve(
      new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }),
    );
  };
}

/** Every path the mock was asked for — so a test can assert which routes were (not) reached. */
const requestedPaths = (mock: ReturnType<typeof vi.fn>): string[] =>
  mock.mock.calls.map(([input]) => new URL(String(input)).pathname);

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn().mockImplementation(routeTo([USD_ROW]));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test("the funded hero shows the backend's rate for USD, not the fixture", async () => {
  const user = userEvent.setup();
  useWallet.mockReturnValue({ address: "GUSER", isConnected: true });
  const client = new MockVaultClient();
  await seedVault(client, "GUSER"); // USD + EUR funded on the seam
  render(
    <VaultProvider client={client}>
      <EarnPage />
    </VaultProvider>,
  );

  await waitFor(() => expect(screen.getByText("Total earned")).toBeInTheDocument());
  // The bucket toggle cycles All buckets → USD bucket (CURRENCIES order).
  await user.click(screen.getByRole("button", { name: "Switch bucket" }));
  await waitFor(() => expect(screen.getByText("USD bucket")).toBeInTheDocument());
  expect(screen.getByText(/8\.20% APY/)).toBeInTheDocument();
  expect(screen.queryByText(/8\.59% APY/)).toBeNull(); // not the fixture…
  expect(screen.queryByText(/7\.75% APY/)).toBeNull(); // …and not /rates either: a funded bucket's rate
                                                       // is the pool it is IN, not the one it would pick.
});

test("every funded bucket takes its rate from its own /holdings row — no fixture rate leaks (KTD4)", async () => {
  const user = userEvent.setup();
  fetchMock.mockImplementation(routeTo([USD_ROW, EUR_ROW]));
  useWallet.mockReturnValue({ address: "GUSER", isConnected: true });
  const client = new MockVaultClient();
  await seedVault(client, "GUSER");
  render(
    <VaultProvider client={client}>
      <EarnPage />
    </VaultProvider>,
  );

  await waitFor(() => expect(screen.getByText("Total earned")).toBeInTheDocument());
  await user.click(screen.getByRole("button", { name: "Switch bucket" })); // USD bucket
  await user.click(screen.getByRole("button", { name: "Switch bucket" })); // EUR bucket
  await waitFor(() => expect(screen.getByText("EUR bucket")).toBeInTheDocument());
  const subline = screen.getByText(/balance · .* APY/).textContent!;
  expect(subline).toMatch(/4\.90% APY/); // the backend's rate…
  expect(subline).not.toMatch(/5\.10% APY/); // …not BUCKET_META's
  expect(subline).not.toMatch(/NaN|0\.00% APY/);
});

test("the empty-state hero and simulator have no /holdings row — so they quote /rates, not the fixture", async () => {
  const user = userEvent.setup();
  // No address, and none is needed: the rate card is user-independent, so it renders for a visitor who
  // has not connected a wallet — which is exactly who the empty-state hero is for.
  useWallet.mockReturnValue({ address: null, isConnected: false });
  render(
    <VaultProvider client={new MockVaultClient()}>
      <EarnPage />
    </VaultProvider>,
  );

  await waitFor(() => expect(screen.getByTestId("hero-apy").textContent).toBe("7.75% APY"));
  // The simulator projects from the same number — one accessor, so the hero and the projection cannot
  // disagree: $1,000 at 7.75% is $77.50, not the fixture's $85.90.
  expect(screen.getByTestId("projection").textContent).toBe("$77.50");

  await user.click(screen.getByRole("button", { name: "EUR" }));
  await waitFor(() => expect(screen.getByTestId("hero-apy").textContent).toBe("4.25% APY"));

  // No wallet ⇒ nothing per-user is fetched; only the user-independent rate card is.
  const paths = requestedPaths(fetchMock);
  expect(paths).toContain("/rates");
  expect(paths).not.toContain("/holdings");
  expect(paths).not.toContain("/earnings");
});

test("a backend that dies mid-demo degrades the funded hero to the fixture, never a blank", async () => {
  const logged = vi.spyOn(console, "error").mockImplementation(() => {});
  const user = userEvent.setup();
  // Every route is down — /holdings AND /rates. The fixture is the last honest number left, and it is
  // why R11 keeps it: a rate the backend cannot confirm still beats "NaN% APY" on a demo screen.
  fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
  useWallet.mockReturnValue({ address: "GUSER", isConnected: true });
  const client = new MockVaultClient();
  await seedVault(client, "GUSER");
  render(
    <VaultProvider client={client}>
      <EarnPage />
    </VaultProvider>,
  );

  await waitFor(() => expect(screen.getByText("Total earned")).toBeInTheDocument());
  await user.click(screen.getByRole("button", { name: "Switch bucket" }));
  await waitFor(() => expect(screen.getByText("USD bucket")).toBeInTheDocument());
  expect(screen.getByText(/8\.59% APY/)).toBeInTheDocument();
  expect(logged).toHaveBeenCalled();
});

test("the funded bucket selector never offers MXN while CETES is coming soon", async () => {
  const user = userEvent.setup();
  fetchMock.mockImplementation(routeTo([USD_ROW, EUR_ROW, MXN_ROW]));
  useWallet.mockReturnValue({ address: "GUSER", isConnected: true });
  const client = new MockVaultClient();
  await seedVault(client, "GUSER");
  render(
    <VaultProvider client={client}>
      <EarnPage />
    </VaultProvider>,
  );

  await waitFor(() => expect(screen.getByText("Total earned")).toBeInTheDocument());
  expect(screen.getByRole("button", { name: "Switch bucket" })).toHaveTextContent("All buckets");
  await user.click(screen.getByRole("button", { name: "Switch bucket" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Switch bucket" })).toHaveTextContent("USD bucket"));
  await user.click(screen.getByRole("button", { name: "Switch bucket" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Switch bucket" })).toHaveTextContent("EUR bucket"));
  await user.click(screen.getByRole("button", { name: "Switch bucket" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Switch bucket" })).toHaveTextContent("All buckets"));
  expect(document.body.textContent).not.toMatch(/MXN|CETES/);
});
