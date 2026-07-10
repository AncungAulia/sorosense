"use client";
import { createContext, useCallback, useEffect, useState, type ReactNode } from "react";
import * as wallet from "../lib/wallet";

type Ctx = {
  address: string | null;
  walletName: string | null;
  isConnected: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  signTransaction: (xdr: string) => Promise<string>;
};
export const WalletContext = createContext<Ctx | null>(null);
const KEY = "soro.wallet";
const NAME_KEY = "soro.wallet.name";

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [walletName, setWalletName] = useState<string | null>(null);

  // NOTE: restoring `address` (and thus `isConnected`) here is OPTIMISTIC — it
  // reflects a previously-saved address, not a verified live wallet session.
  // A future auth-gate (Task 9/10) that trusts `isConnected` before entering
  // signing flows should re-verify via `getAddress()` first and clear state
  // on mismatch.
  useEffect(() => {
    const saved = window.localStorage.getItem(KEY);
    const savedName = window.localStorage.getItem(NAME_KEY);
    // One-time hydration from localStorage on mount. Reading storage during
    // render (lazy useState init) is not SSR-safe and would cause a hydration
    // mismatch, so the setState-in-effect here is intentional.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved) setAddress(saved);
    // The kit does not persist the selected wallet id across reloads (see the KNOWN LIMITATION
    // note in lib/wallet.ts), so after a refresh `getWalletName()` would lie and always say
    // "Freighter". The name recorded at connect time, persisted here, is the only truthful
    // source for a restored session — do not call getWalletName() again on hydration.
    // (No second eslint-disable needed here: the rule flags this effect once, on the first
    // setState call above.)
    if (savedName) setWalletName(savedName);
  }, []);

  const connect = useCallback(async () => {
    const { address: addr, name } = await wallet.connect();
    setAddress(addr);
    setWalletName(name);
    window.localStorage.setItem(KEY, addr);
    window.localStorage.setItem(NAME_KEY, name);
  }, []);

  const disconnect = useCallback(async () => {
    await wallet.disconnect();
    setAddress(null);
    setWalletName(null);
    window.localStorage.removeItem(KEY);
    window.localStorage.removeItem(NAME_KEY);
  }, []);

  return (
    <WalletContext.Provider
      value={{ address, walletName, isConnected: !!address, connect, disconnect, signTransaction: wallet.signTransaction }}
    >
      {children}
    </WalletContext.Provider>
  );
}
