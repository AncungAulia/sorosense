"use client";
import { createContext, useEffect, useRef, useState, type ReactNode } from "react";
import { MockVaultClient } from "@sorosense/vault-client";
import { useWallet } from "../hooks/useWallet";
import { seedVault } from "../lib/vault/seed";

type Ctx = { client: MockVaultClient };
export const VaultContext = createContext<Ctx | null>(null);

// Module singleton so a deposit made on one screen is visible on another (mock is in-memory).
let singleton: MockVaultClient | null = null;
function getSingleton(): MockVaultClient {
  if (!singleton) singleton = new MockVaultClient();
  return singleton;
}

export function VaultProvider({ children, client }: { children: ReactNode; client?: MockVaultClient }) {
  const ref = useRef<MockVaultClient>(client ?? getSingleton());
  const { address } = useWallet();
  const [, force] = useState(0);

  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    // Dev-only seed; a no-op once the bucket is funded. Replaced by real reads at U20.
    void seedVault(ref.current, address).then(() => {
      if (!cancelled) force((n) => n + 1);
    });
    return () => { cancelled = true; };
  }, [address]);

  return <VaultContext.Provider value={{ client: ref.current }}>{children}</VaultContext.Provider>;
}
