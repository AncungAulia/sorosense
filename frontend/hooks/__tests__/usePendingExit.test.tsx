import type { ReactNode } from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { MockVaultClient } from "@sorosense/vault-client";
import { VaultProvider } from "../../providers/VaultProvider";
import { seedVault } from "../../lib/vault/seed";
import { usePendingExit } from "../usePendingExit";

const useWallet = vi.fn();
vi.mock("../useWallet", () => ({ useWallet: () => useWallet() }));

test("surfaces the frozen EUR bucket with its safe-exit proposal", async () => {
  useWallet.mockReturnValue({ address: "GUSER", isConnected: true });
  const client = new MockVaultClient();
  await seedVault(client, "GUSER");
  const wrapper = ({ children }: { children: ReactNode }) => (
    <VaultProvider client={client}>{children}</VaultProvider>
  );
  const { result } = renderHook(() => usePendingExit(), { wrapper });

  await waitFor(() => expect(result.current?.currency).toBe("EUR"));
  expect(result.current?.proposal).not.toBeNull();
  expect(result.current?.fromLabel).toBe("Paused EURC pool");
  expect(result.current?.toMeta?.name).toBe("DeFindex EURC");
  expect(result.current?.amount).toBeGreaterThan(0n);
});

test("returns null when there is no frozen bucket", async () => {
  useWallet.mockReturnValue({ address: "GUSER", isConnected: true });
  const client = new MockVaultClient(); // unseeded → nothing frozen
  const wrapper = ({ children }: { children: ReactNode }) => (
    <VaultProvider client={client}>{children}</VaultProvider>
  );
  const { result } = renderHook(() => usePendingExit(), { wrapper });
  await waitFor(() => expect(result.current).toBeNull());
});
