/**
 * The exit-approval sheet's target pool with the backend **enabled** (R13).
 *
 * The offline half — `POOL_META`, keyed by the local seed's pool ids — is pinned in
 * `usePendingExit.test.tsx`, which runs with `NEXT_PUBLIC_API_URL` absent.
 *
 * The two id spaces are genuinely different, and that is the point of this file: on-chain,
 * `ExitProposal.toPool` is a seam `PoolId` from the backend catalog (`blend-eurc`) — a slug `POOL_META`
 * has never carried. With the API on, the sheet must name the pool the **keeper actually proposed**, not
 * the one the browser's mock proposed to itself.
 */
import type { ReactNode } from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { MockVaultClient, mockSigner } from "@sorosense/vault-client";
import { VaultProvider } from "../../providers/VaultProvider";
import { usePendingExit } from "../usePendingExit";

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_API_URL = "http://localhost:8787";
});
afterAll(() => {
  delete process.env.NEXT_PUBLIC_API_URL;
});

const useWallet = vi.fn();
vi.mock("../useWallet", () => ({ useWallet: () => useWallet() }));

const UNIT = 10_000_000n;
const keeper = mockSigner("keeper");
const alice = mockSigner("depositor", "GUSER");

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
 * A frozen EUR bucket whose pool ids are the ones the **chain** uses — catalog slugs (`blend-eurc`),
 * not the local seed's (`pool-blend-eur`).
 *
 * The USD deposit is load-bearing: `VaultProvider` runs the dev seed on mount for any mock client whose
 * USD bucket is empty, and that seed would re-freeze EUR at its own ids and overwrite the proposal we
 * are here to read. Funding USD makes the seed the no-op it advertises itself to be.
 */
async function seedFrozenOnChain(client: MockVaultClient, toPool: string): Promise<void> {
  await client.deposit("GUSER", "USD", 1n * UNIT).signAndSubmit(alice);
  await client.deposit("GUSER", "EUR", 900n * UNIT).signAndSubmit(alice);
  await client.allocate("blend-eurc", "EUR", 900n * UNIT).signAndSubmit(keeper);
  await client.freeze("blend-eurc").signAndSubmit(keeper);
  await client.proposeExit("EUR", "blend-eurc", toPool).signAndSubmit(keeper);
}

function wrap(client: MockVaultClient) {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <VaultProvider client={client}>{children}</VaultProvider>
  );
  Wrapper.displayName = "VaultWrapper";
  return Wrapper;
}

function json(body: unknown, status = 200) {
  return () =>
    Promise.resolve(
      new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }),
    );
}

test("the exit target is named and rated by GET /pools/:id, not by POOL_META", async () => {
  const client = new MockVaultClient();
  await seedFrozenOnChain(client, "defindex-usdc");
  fetchMock.mockImplementation(json({ id: "defindex-usdc", name: "DeFindex USDC vault", venue: "DeFindex", apy: 8.59 }));

  const { result } = renderHook(() => usePendingExit(), { wrapper: wrap(client) });

  // The catalog's name and rate, for a slug POOL_META has no entry for — so this can only be the route.
  await waitFor(() =>
    expect(result.current?.toMeta).toEqual({ name: "DeFindex USDC vault", apy: 8.59 }),
  );
  const [url] = fetchMock.mock.calls[0] as [string];
  expect(new URL(url).pathname).toBe("/pools/defindex-usdc");
});

test("a pool the catalog does not carry 404s and leaves the target unnamed — never an invented name", async () => {
  const logged = vi.spyOn(console, "error").mockImplementation(() => {});
  const client = new MockVaultClient();
  await seedFrozenOnChain(client, "some-unvetted-pool");
  // The route answers a shaped 404 for a pool it cannot resolve (it never returns a 200 with `null`).
  fetchMock.mockImplementation(json({ error: { code: "not_found", message: "unknown pool: some-unvetted-pool" } }, 404));

  const { result } = renderHook(() => usePendingExit(), { wrapper: wrap(client) });

  await waitFor(() => expect(result.current?.currency).toBe("EUR"));
  // The sheet still opens — the freeze is real and the user still has to approve it — but the target
  // renders as its unnamed state rather than borrowing a fixture name for a pool nobody resolved.
  expect(result.current?.proposal).not.toBeNull();
  expect(result.current?.toMeta).toBeNull();
  expect(logged).toHaveBeenCalled();
});

test("a dead backend degrades the target to POOL_META, never to a blank sheet", async () => {
  const logged = vi.spyOn(console, "error").mockImplementation(() => {});
  const client = new MockVaultClient();
  // The offline seed's ids — what a browser-mock demo really holds when the backend dies mid-freeze.
  await client.deposit("GUSER", "USD", 1n * UNIT).signAndSubmit(alice);
  await client.deposit("GUSER", "EUR", 900n * UNIT).signAndSubmit(alice);
  await client.allocate("pool-blend-eur", "EUR", 900n * UNIT).signAndSubmit(keeper);
  await client.freeze("pool-blend-eur").signAndSubmit(keeper);
  await client.proposeExit("EUR", "pool-blend-eur", "pool-defindex-eur").signAndSubmit(keeper);
  fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

  const { result } = renderHook(() => usePendingExit(), { wrapper: wrap(client) });

  await waitFor(() => expect(result.current?.toMeta?.name).toBe("DeFindex EURC")); // POOL_META (R11)
  expect(logged).toHaveBeenCalled();
});
