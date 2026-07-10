"use client";
import { createContext, useCallback, useEffect, useState, type ReactNode } from "react";
import { MockVaultClient } from "@sorosense/vault-client";
import { useWallet } from "../hooks/useWallet";
import { seedVault } from "../lib/vault/seed";
import { E2E, installE2EBridge } from "../lib/e2e/bridge";

type Ctx = { client: MockVaultClient; version: number; bump: () => void };
export const VaultContext = createContext<Ctx | null>(null);

// Module singleton so a deposit made on one screen is visible on another (mock is in-memory).
let singleton: MockVaultClient | null = null;
function getSingleton(): MockVaultClient {
  if (!singleton) singleton = new MockVaultClient();
  return singleton;
}

export function VaultProvider({ children, client }: { children: ReactNode; client?: MockVaultClient }) {
  // getSingleton() is idempotent (same instance every call) and `client` is caller-fixed, so this
  // resolves to a stable reference across renders without needing a ref.
  const resolvedClient = client ?? getSingleton();
  const { address } = useWallet();
  const [version, setVersion] = useState(0);

  const bump = useCallback(() => setVersion((n) => n + 1), []);

  useEffect(() => {
    // Under e2e the vault starts empty: the spec plays the keeper through the bridge below, so every
    // state change has a visible cause instead of arriving pre-seeded. It is also the only way to
    // reach Earn's empty state — where <Simulator> lives — while a wallet is connected.
    if (!address || E2E) return;
    let cancelled = false;
    // Dev-only seed; a no-op once the bucket is funded. Replaced by real reads at U20.
    void seedVault(resolvedClient, address).then(() => {
      if (!cancelled) setVersion((n) => n + 1);
    });
    return () => { cancelled = true; };
  }, [address, resolvedClient]);

  useEffect(() => {
    installE2EBridge(resolvedClient, bump);
  }, [resolvedClient, bump]);

  return <VaultContext.Provider value={{ client: resolvedClient, version, bump }}>{children}</VaultContext.Provider>;
}
