import { render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { renderHook, act } from "@testing-library/react";
import { MockVaultClient } from "@sorosense/vault-client";
import { VaultProvider } from "../VaultProvider";
import { useVault } from "../../hooks/useVault";

const useWallet = vi.fn();
vi.mock("../../hooks/useWallet", () => ({ useWallet: () => useWallet() }));

function Probe() {
  const { client } = useVault();
  return <span>client:{client ? "yes" : "no"}</span>;
}

test("provides an injected client and seeds it when connected", async () => {
  useWallet.mockReturnValue({ address: "GUSER" });
  const client = new MockVaultClient();
  render(<VaultProvider client={client}><Probe /></VaultProvider>);
  expect(screen.getByText("client:yes")).toBeInTheDocument();
  await waitFor(async () => expect(await client.balanceOf("GUSER", "USD")).toBeGreaterThan(0n));
});

test("bump() increments version so consumers re-read", () => {
  // useWallet is already mocked above (module-level vi.fn()); mocks are not reset between
  // tests in this file, so set address: undefined explicitly — the seed effect early-returns
  // and never bumps, keeping version deterministic regardless of test order.
  useWallet.mockReturnValue({ address: undefined });
  const client = new MockVaultClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <VaultProvider client={client}>{children}</VaultProvider>
  );
  const { result } = renderHook(() => useVault(), { wrapper });
  const before = result.current.version;
  act(() => result.current.bump());
  expect(result.current.version).toBe(before + 1);
});

/**
 * R3 / KTD2 / KTD3 — the config gate. The provider re-imports under stubbed env because
 * `lib/vault/client.ts` captures the `NEXT_PUBLIC_*` vars at module load (which is what lets Next
 * inline them and strip the real branch from an unconfigured build).
 */
const LIVE_ENV = {
  NEXT_PUBLIC_VAULT_CONTRACT_ID: "CCONTRACTIDXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  NEXT_PUBLIC_STELLAR_RPC_URL: "https://soroban-testnet.stellar.org",
  NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE: "Test SDF Network ; September 2015",
};

async function importLive() {
  for (const [key, value] of Object.entries(LIVE_ENV)) vi.stubEnv(key, value);
  vi.resetModules();
  const [provider, hook, seam] = await Promise.all([
    import("../VaultProvider"),
    import("../../hooks/useVault"),
    import("@sorosense/vault-client"),
  ]);
  return { ...provider, ...hook, ...seam };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

test("env set: the client is real, nothing is seeded, and no request leaves on mount", async () => {
  const fetchSpy = vi.fn();
  vi.stubGlobal("fetch", fetchSpy);
  const { VaultProvider: LiveProvider, useVault: useLiveVault, MockVaultClient: Mock, RealVaultClient: Real } =
    await importLive();
  useWallet.mockReturnValue({ address: "GUSER", signTransaction: async (x: string) => x });

  const seen: unknown[] = [];
  function Peek() {
    seen.push(useLiveVault().client);
    return null;
  }
  render(<LiveProvider><Peek /></LiveProvider>);

  expect(seen.at(-1)).toBeInstanceOf(Real);
  expect(seen.at(-1)).not.toBeInstanceOf(Mock);
  // No seed and no e2e bridge: both drive the mock-only `simulateYield`, which a real client does not
  // have and must never grow a faked one. In real mode Home starts from actual on-chain state.
  expect(window.__sorosense__).toBeUndefined();
  await waitFor(() => expect(fetchSpy).not.toHaveBeenCalled());
});

test("env set: switching the connected address rebuilds the real client (KTD3)", async () => {
  const { VaultProvider: LiveProvider, useVault: useLiveVault } = await importLive();
  useWallet.mockReturnValue({ address: "GONE", signTransaction: async (x: string) => x });

  const seen: unknown[] = [];
  function Peek() {
    seen.push(useLiveVault().client);
    return null;
  }
  const { rerender } = render(<LiveProvider><Peek /></LiveProvider>);
  const first = seen.at(-1);

  useWallet.mockReturnValue({ address: "GTWO", signTransaction: async (x: string) => x });
  rerender(<LiveProvider><Peek /></LiveProvider>);

  // The real client assembles writes against the connected account as source — a stale one would sign
  // for the previous address.
  expect(seen.at(-1)).not.toBe(first);
});

test("env unset (the default): the client is the mock and it gets seeded", async () => {
  useWallet.mockReturnValue({ address: "GUSER" });
  const client = new MockVaultClient();
  render(<VaultProvider client={client}><Probe /></VaultProvider>);

  expect(screen.getByText("client:yes")).toBeInTheDocument();
  await waitFor(async () => expect(await client.balanceOf("GUSER", "USD")).toBeGreaterThan(0n));
});
