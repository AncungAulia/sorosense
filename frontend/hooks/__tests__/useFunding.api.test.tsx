/**
 * `useFunding` with the backend **enabled** — `GET /funding` (R7 · R19).
 *
 * The list is user-independent, so unlike `/holdings` there is no mock-divergence to guard (KTD4 does
 * not apply): a mock-mode backend answers this as truthfully as a live one. RWA options carry **no**
 * `apy` — the rate shows at the deposit step (AE5) — and nothing carries a risk/label/score/tier field.
 */
import { render, screen, waitFor } from "@testing-library/react";
import { STABLECOINS } from "../../lib/vault/data";
import { useFunding } from "../useFunding";

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_API_URL = "http://localhost:8787";
});
afterAll(() => {
  delete process.env.NEXT_PUBLIC_API_URL;
});

/** What the backend sends — deliberately NOT the frontend fixture: a different order, and RWA rows. */
const FUNDING = {
  stablecoins: [
    { sym: "EURC", currency: "EUR", chains: ["Stellar"] },
    { sym: "USDC", currency: "USD", chains: ["Stellar", "Solana"] },
  ],
  rwa: [{ id: "etherfuse-cetes", name: "CETES", venue: "Etherfuse", currency: "MXN" }],
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function respondWith(body: unknown, status = 200) {
  fetchMock.mockImplementation(() =>
    Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })),
  );
}

function Probe() {
  const { loading, options } = useFunding();
  if (loading) return <span>loading</span>;
  return (
    <ul>
      <li data-testid="syms">{options.stablecoins.map((s) => `${s.sym}:${s.currency}:${s.chains.join("+")}`).join(",")}</li>
      <li data-testid="rwa">{options.rwa.map((r) => `${r.id}|${r.name}|${r.venue}|${r.currency}`).join(",")}</li>
      <li data-testid="rwa-keys">{options.rwa[0] ? Object.keys(options.rwa[0]).sort().join(",") : ""}</li>
    </ul>
  );
}

test("the list is the backend's, in the backend's order — not the fixture", async () => {
  respondWith(FUNDING);
  render(<Probe />);

  await waitFor(() => expect(screen.getByTestId("syms")).toBeInTheDocument());
  const [url] = fetchMock.mock.calls[0] as [string];
  expect(url).toBe("http://localhost:8787/funding");
  expect(screen.getByTestId("syms").textContent).toBe("EURC:EUR:Stellar,USDC:USD:Stellar+Solana");
  // The fixture leads with USDC, lists three coins, and knows nothing of a Solana USDC — the rendered
  // list is none of those things, so it cannot have come from the fixture.
  expect(screen.getByTestId("syms").textContent).not.toBe(
    STABLECOINS.map((s) => `${s.sym}:${s.currency}:${s.chains.join("+")}`).join(","),
  );
});

test("RWA options come through, and carry no apy (nor any risk/label/score/tier field)", async () => {
  respondWith(FUNDING);
  render(<Probe />);

  await waitFor(() => expect(screen.getByTestId("rwa")).toBeInTheDocument());
  expect(screen.getByTestId("rwa").textContent).toBe("etherfuse-cetes|CETES|Etherfuse|MXN");
  expect(screen.getByTestId("rwa-keys").textContent).toBe("currency,id,name,venue");
});

test("a failed read falls back to the fixture — the user can still reach the deposit flow", async () => {
  const logged = vi.spyOn(console, "error").mockImplementation(() => {});
  respondWith({ error: { code: "unavailable", message: "backend down" } }, 503);
  render(<Probe />);

  await waitFor(() => expect(logged).toHaveBeenCalled());
  await waitFor(() => expect(screen.getByTestId("syms")).toBeInTheDocument());
  expect(screen.getByTestId("syms").textContent).toBe(
    STABLECOINS.map((s) => `${s.sym}:${s.currency}:${s.chains.join("+")}`).join(","),
  );
  expect(screen.getByTestId("rwa").textContent).toBe(""); // the fixture has no RWA options
});
