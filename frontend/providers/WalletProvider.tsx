"use client";
import { createContext, useCallback, useEffect, useState, type ReactNode } from "react";
import * as wallet from "../lib/wallet";

type Ctx = {
  address: string | null;
  isConnected: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  signTransaction: (xdr: string) => Promise<string>;
};
export const WalletContext = createContext<Ctx | null>(null);
const KEY = "soro.wallet";

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);

  // NOTE: restoring `address` (and thus `isConnected`) here is OPTIMISTIC — it
  // reflects a previously-saved address, not a verified live wallet session.
  // A future auth-gate (Task 9/10) that trusts `isConnected` before entering
  // signing flows should re-verify via `getAddress()` first and clear state
  // on mismatch.
  useEffect(() => {
    const saved = window.localStorage.getItem(KEY);
    if (saved) setAddress(saved);
  }, []);

  const connect = useCallback(async () => {
    const addr = await wallet.connect();
    setAddress(addr);
    window.localStorage.setItem(KEY, addr);
  }, []);

  const disconnect = useCallback(async () => {
    await wallet.disconnect();
    setAddress(null);
    window.localStorage.removeItem(KEY);
  }, []);

  return (
    <WalletContext.Provider value={{ address, isConnected: !!address, connect, disconnect, signTransaction: wallet.signTransaction }}>
      {children}
    </WalletContext.Provider>
  );
}
