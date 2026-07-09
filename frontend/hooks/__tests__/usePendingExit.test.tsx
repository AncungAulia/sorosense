import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { MockVaultClient, mockSigner } from "@sorosense/vault-client";
import { VaultProvider } from "../../providers/VaultProvider";
import { seedVault, SEED_POOLS } from "../../lib/vault/seed";
import { usePendingExit } from "../usePendingExit";
import { useVault } from "../useVault";

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

test("returns null once the frozen bucket is unfrozen (settled, not initial state)", async () => {
  useWallet.mockReturnValue({ address: "GUSER", isConnected: true });
  const client = new MockVaultClient();
  await seedVault(client, "GUSER"); // EUR frozen + proposed
  const wrapper = ({ children }: { children: ReactNode }) => (
    <VaultProvider client={client}>{children}</VaultProvider>
  );
  const { result } = renderHook(
    () => ({ view: usePendingExit(), bump: useVault().bump }),
    { wrapper },
  );

  // Prove the effect actually ran and observed the frozen bucket first.
  await waitFor(() => expect(result.current.view?.currency).toBe("EUR"));

  // Unfreeze EUR and force a re-read — this must transition non-null → null.
  await act(async () => {
    await client.unfreeze(SEED_POOLS.EUR).signAndSubmit(mockSigner("keeper"));
    result.current.bump();
  });

  await waitFor(() => expect(result.current.view).toBeNull());
});
