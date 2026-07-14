import { buildPoolRegistry } from "../client";

/**
 * The config gate (R3, KTD2). `lib/vault/client.ts` captures the `NEXT_PUBLIC_*` vars at module load
 * (that is what lets Next inline them), so each env case re-imports the module under stubbed vars.
 * The seam is re-imported from the SAME reset graph, so `toBeInstanceOf` compares the class the
 * factory actually constructed rather than a stale copy of it.
 */
async function withEnv(env: Record<string, string>) {
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  vi.resetModules();
  const [factory, seam] = await Promise.all([import("../client"), import("@sorosense/vault-client")]);
  return { ...factory, ...seam };
}

const CONTRACT = { NEXT_PUBLIC_VAULT_CONTRACT_ID: "CCONTRACTIDXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX" };
const RPC = { NEXT_PUBLIC_STELLAR_RPC_URL: "https://soroban-testnet.stellar.org" };
const PASSPHRASE = { NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE: "Test SDF Network ; September 2015" };

const fetchSpy = vi.fn();

beforeEach(() => vi.stubGlobal("fetch", fetchSpy));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  fetchSpy.mockClear();
});

test("no contract env ⇒ the mock, and not one network call (the offline guarantee)", async () => {
  const { createVaultClient, isIntegrationEnv, MockVaultClient } = await withEnv({});

  const client = createVaultClient({ address: "GUSER", signTransaction: async (x) => x });

  expect(isIntegrationEnv()).toBe(false);
  expect(client).toBeInstanceOf(MockVaultClient);
  // The whole vitest + Playwright baseline rests on this: with the env unset there is no RPC client
  // to build, so nothing can leave the browser.
  expect(fetchSpy).not.toHaveBeenCalled();
});

test("all three vars set ⇒ the real client, carrying the connected address and signer", async () => {
  const { createVaultClient, isIntegrationEnv, RealVaultClient } = await withEnv({ ...CONTRACT, ...RPC, ...PASSPHRASE });
  const signTransaction = vi.fn(async (xdr: string) => `signed:${xdr}`);

  const client = createVaultClient({ address: "GUSER", signTransaction });

  expect(isIntegrationEnv()).toBe(true);
  expect(client).toBeInstanceOf(RealVaultClient);
  // Building the client simulates nothing and submits nothing — the network is touched on the first
  // read or submit, not at construction.
  expect(fetchSpy).not.toHaveBeenCalled();
  expect(signTransaction).not.toHaveBeenCalled();
});

test("a disconnected wallet still gets a real read-only client (reads need no signer)", async () => {
  const { createVaultClient, RealVaultClient } = await withEnv({ ...CONTRACT, ...RPC, ...PASSPHRASE });

  expect(createVaultClient({ address: null })).toBeInstanceOf(RealVaultClient);
});

test("a partial env falls back to the mock rather than half-building a real client", async () => {
  // A contract id with no RPC URL would otherwise produce a client that only fails at submit time,
  // in front of the user.
  const only = await withEnv({ ...CONTRACT });

  expect(only.isIntegrationEnv()).toBe(false);
  expect(only.createVaultClient({ address: "GUSER" })).toBeInstanceOf(only.MockVaultClient);

  const partial = await withEnv({ ...CONTRACT, ...RPC }); // still no passphrase
  expect(partial.isIntegrationEnv()).toBe(false);
  expect(partial.createVaultClient({ address: "GUSER" })).toBeInstanceOf(partial.MockVaultClient);
});

describe("pool registry — both directions from one map (KTD5, R7)", () => {
  const USD_POOL = "CBLENDUSDCPOOLADDRESSXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX";
  const EUR_POOL = "CBLENDEURCPOOLADDRESSYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYY";

  test("a slug encodes to its address, and that address decodes back to the slug", () => {
    const registry = buildPoolRegistry({ USD: USD_POOL, EUR: EUR_POOL });

    expect(registry?.resolvePool("blend-usdc")).toBe(USD_POOL);
    expect(registry?.poolIdFor(USD_POOL)).toBe("blend-usdc");
    expect(registry?.resolvePool("blend-eurc")).toBe(EUR_POOL);
    expect(registry?.poolIdFor(EUR_POOL)).toBe("blend-eurc");
  });

  test("an unknown address decodes to itself; an unknown slug throws", () => {
    const registry = buildPoolRegistry({ USD: USD_POOL });
    const stranger = "CSOMEOTHERPOOLZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ";

    // Displaying a pool we cannot name is fine; writing to one we cannot name is a bug.
    expect(registry?.poolIdFor(stranger)).toBe(stranger);
    expect(() => registry?.resolvePool("blend-eurc")).toThrow(/unknown pool: blend-eurc/);
  });

  test("no configured pool address ⇒ no registry (ids pass through, today's behavior)", () => {
    expect(buildPoolRegistry({})).toBeUndefined();
  });
});
