"use client";
import { createContext, useCallback, useEffect, useState, type ReactNode } from "react";
import * as wallet from "../lib/wallet";

type Ctx = {
  // undefined = not hydrated yet (localStorage not read); null = definitively
  // disconnected; string = a re-verified live session. `hydrated`/`isConnected`
  // are derived from it so consumers never re-derive the tri-state by hand.
  address: string | null | undefined;
  walletName: string | null;
  hydrated: boolean;
  isConnected: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  signTransaction: (xdr: string) => Promise<string>;
};
export const WalletContext = createContext<Ctx | null>(null);
const KEY = "soro.wallet";
const NAME_KEY = "soro.wallet.name";

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null | undefined>(undefined);
  const [walletName, setWalletName] = useState<string | null>(null);

  // One-time hydration on mount. Reading storage during render (lazy useState init) is not
  // SSR-safe and would cause a hydration mismatch, so this runs in an effect. The restored
  // address is re-verified against the live wallet before we trust it: a previously-saved
  // address is not a live session (the user may have revoked, locked, or switched accounts),
  // so entering the app on it would only fail later, at signing time. Verify, then trust.
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const saved = window.localStorage.getItem(KEY);
        if (!saved) {
          if (alive) setAddress(null);
          return;
        }
        // Re-verify the restored address against the live wallet before trusting it: a
        // previously-saved address is not a live session (the user may have revoked, locked, or
        // switched accounts), so entering the app on it would only fail later, at signing time.
        const live = await wallet.getAddress();
        if (!alive) return;
        if (live === saved) {
          setAddress(saved);
          // The kit does not persist the selected wallet id across reloads, so getWalletName()
          // would lie and say "Freighter"; the name captured at connect time is the only truthful
          // source for a restored session.
          setWalletName(window.localStorage.getItem(NAME_KEY));
          return;
        }
        // Mismatch (account switch / foreign wallet) — fall through to clear.
      } catch {
        // getAddress rejected (locked / revoked / no permission), OR localStorage access itself
        // threw (private mode / sandboxed). Either way: no verified session. Fall through to clear
        // and resolve hydration — never hang at the undefined/skeleton state.
      }
      if (!alive) return;
      try {
        window.localStorage.removeItem(KEY);
        window.localStorage.removeItem(NAME_KEY);
      } catch {
        // storage unavailable — nothing to clear.
      }
      setAddress(null);
    })();
    return () => {
      alive = false;
    };
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
      value={{
        address,
        walletName,
        hydrated: address !== undefined,
        isConnected: !!address,
        connect,
        disconnect,
        signTransaction: wallet.signTransaction,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}
