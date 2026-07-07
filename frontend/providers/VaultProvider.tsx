"use client";
import { createContext, useEffect, useState, type ReactNode } from "react";
import { MockVaultClient } from "@sorosense/vault-client";
import { useWallet } from "../hooks/useWallet";
import { seedVault } from "../lib/vault/seed";

type Ctx = { client: MockVaultClient; version: number };
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

  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    // Dev-only seed; a no-op once the bucket is funded. Replaced by real reads at U20.
    void seedVault(resolvedClient, address).then(() => {
      if (!cancelled) setVersion((n) => n + 1);
    });
    return () => { cancelled = true; };
  }, [address, resolvedClient]);

  return <VaultContext.Provider value={{ client: resolvedClient, version }}>{children}</VaultContext.Provider>;
}
