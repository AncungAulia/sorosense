/**
 * `useActivity` with the backend **enabled** — `GET /activity?depositor=…` (R6 · STE-42).
 *
 * The backend merges its own agent log with the user's decoded on-chain actions and returns one
 * ordered feed. This file pins the mapping `FeedEntry → ActivityItem`: the actor becomes the tab
 * category, `kind` drives the two affordances the list has (a freeze is flagged, a proposed exit is
 * reviewable), and `ts` becomes a relative time read **after mount**. The offline half is next door.
 */
import { render, screen, waitFor } from "@testing-library/react";
import { MockVaultClient } from "@sorosense/vault-client";
import { VaultProvider } from "../../providers/VaultProvider";
import { useActivity, relativeTime, itemFromEntry } from "../useActivity";

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_API_URL = "http://localhost:8787";
});
afterAll(() => {
  delete process.env.NEXT_PUBLIC_API_URL;
});

const useWallet = vi.fn();
vi.mock("../../hooks/useWallet", () => ({ useWallet: () => useWallet() }));

const HOUR = 3_600_000;

/** The feed as the backend sends it: most-recent-first, agent rows and user rows interleaved. */
function feed(now: number) {
  return [
    { seq: 9, actor: "agent", currency: "USD", kind: "rebalanced", detail: "Switched to DeFindex", ts: now - 3 * HOUR },
    { seq: 8, actor: "agent", currency: "EUR", kind: "froze", detail: "Paused EURC pool for safety", ts: now - 6 * HOUR },
    { seq: 7, actor: "agent", currency: "EUR", kind: "proposed-exit", detail: "Proposed safe exit from EURC pool", ts: now - 6 * HOUR },
    { seq: 6, actor: "you", currency: "USD", kind: "deposit", detail: "Deposited to USD bucket", depositor: "GUSER", ts: now - 30 * HOUR },
    { seq: 5, actor: "you", kind: "sign-mandate", detail: "Signed auto-optimize mandate", depositor: "GUSER" }, // no ts
  ];
}

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

function respondWith(body: unknown, status = 200) {
  fetchMock.mockImplementation(() =>
    Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })),
  );
}

function Probe() {
  const { loading, items } = useActivity();
  if (loading) return <span>loading</span>;
  return (
    <ul>
      <li data-testid="order">{items.map((i) => i.id).join(",")}</li>
      {items.map((i) => (
        <li key={i.id} data-testid={`row-${i.id}`}>
          {i.cat}|{i.kind}|{i.detail}|{i.when}|{i.flag ? "flag" : "-"}|{i.review ? "review" : "-"}
        </li>
      ))}
    </ul>
  );
}

function renderFeed() {
  render(
    <VaultProvider client={new MockVaultClient()}>
      <Probe />
    </VaultProvider>,
  );
}

test("the feed is read for this depositor, and an agent row and a user row land in the right tabs", async () => {
  respondWith(feed(Date.now()));
  renderFeed();

  await waitFor(() => expect(screen.getByTestId("row-9")).toBeInTheDocument());
  const [url] = fetchMock.mock.calls[0] as [string];
  expect(url).toBe("http://localhost:8787/activity?depositor=GUSER");

  // actor 'agent' → the Automated tab; actor 'you' → the Yours tab.
  expect(screen.getByTestId("row-9").textContent).toContain("auto|rebalanced|Switched to DeFindex|3h ago");
  expect(screen.getByTestId("row-6").textContent).toContain("you|deposit|Deposited to USD bucket|1d ago");
});

test("a froze row is flagged, a proposed-exit row is reviewable, and nothing else is", async () => {
  respondWith(feed(Date.now()));
  renderFeed();

  await waitFor(() => expect(screen.getByTestId("row-8")).toBeInTheDocument());
  expect(screen.getByTestId("row-8").textContent).toContain("|flag|-");
  expect(screen.getByTestId("row-7").textContent).toContain("|-|review");
  expect(screen.getByTestId("row-9").textContent).toContain("|-|-");
});

test("ordering is the backend's — most-recent-first, by its monotonic seq", async () => {
  respondWith(feed(Date.now()));
  renderFeed();

  await waitFor(() => expect(screen.getByTestId("order")).toBeInTheDocument());
  expect(screen.getByTestId("order").textContent).toBe("9,8,7,6,5");
});

test("a row the source gave no timestamp renders no time, not a fabricated one", async () => {
  respondWith(feed(Date.now()));
  renderFeed();

  await waitFor(() => expect(screen.getByTestId("row-5")).toBeInTheDocument());
  // `sign-mandate` came through with no `ts`: the row is real, its time is simply unknown.
  expect(screen.getByTestId("row-5").textContent).toBe("you|sign-mandate|Signed auto-optimize mandate||-|-");
});

test("a failed read falls back to the fixture — an empty feed would claim nothing had happened", async () => {
  const logged = vi.spyOn(console, "error").mockImplementation(() => {});
  respondWith({ error: { code: "unavailable", message: "backend down" } }, 503);
  renderFeed();

  await waitFor(() => expect(logged).toHaveBeenCalled());
  // The 8-row fixture, not zero rows.
  await waitFor(() => expect(screen.getByTestId("order").textContent).toBe("8,7,6,5,4,3,2,1"));
});

test("relativeTime spans the units it claims, and never runs backwards", () => {
  const now = 1_000 * HOUR;
  expect(relativeTime(now, now)).toBe("just now");
  expect(relativeTime(now - 45_000, now)).toBe("just now"); // under a minute
  expect(relativeTime(now - 5 * 60_000, now)).toBe("5m ago");
  expect(relativeTime(now - 3 * HOUR, now)).toBe("3h ago");
  expect(relativeTime(now - 50 * HOUR, now)).toBe("2d ago");
  // A backend clock a little ahead of the browser's must not render "-1m ago".
  expect(relativeTime(now + 30_000, now)).toBe("just now");
  expect(relativeTime(undefined, now)).toBe("");
});

test("no risk, label, score or tier field reaches a feed row (safety is invisible)", () => {
  const rogue = {
    seq: 1, actor: "agent", kind: "froze", detail: "Paused EURC pool for safety", ts: 0,
    risk: "high", label: "toxic", score: 3, tier: "C",
  } as never;
  expect(Object.keys(itemFromEntry(rogue, 0)).sort().join(",")).toBe("cat,detail,flag,id,kind,when");
});
