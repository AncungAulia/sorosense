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
