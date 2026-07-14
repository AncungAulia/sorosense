"use client";
import { useCallback, useEffect, useState } from "react";
import { balanceEnabled, readWalletBalance } from "../lib/wallet/balance";
import { getFixtureWalletBalance, type StablecoinSym } from "../lib/vault/data";
import { useWallet } from "./useWallet";

/**
 * The deposit surfaces' available balance (R6 · KTD2 · KTD7).
 *
 * Live when Horizon **and** this symbol's issuer are configured and a wallet is connected; the
 * `getFixtureWalletBalance` value otherwise — so vitest, Playwright and a bare `pnpm dev` keep today's
 * behavior with zero network. The read runs inside the effect, never at module scope.
 *
 * `trustline` / `unfunded` are surfaced, not folded into the number: a zero balance with no trustline is
 * the faucet's cue ("Get test funds"), while an unfunded account needs XLM first — a different fix.
 */
export interface WalletBalanceView {
  loading: boolean;
  /** Base units available to deposit. The fixture value when the live read is off. */
  available: bigint;
  /** False when the asset is absent from the account's balances — the faucet's `changeTrust` path. */
  trustline: boolean;
  /** True when Horizon has no such account at all (no XLM yet). */
  unfunded: boolean;
  /** Whether `available` came from Horizon (true) or the fixture (false). */
  live: boolean;
  /** Re-read after a mint lands, so the keypad's available line actually moves. */
  refresh: () => void;
}

export function useWalletBalance(sym: StablecoinSym | null): WalletBalanceView {
  const { address } = useWallet();
  const live = sym !== null && balanceEnabled(sym) && Boolean(address);

  const [state, setState] = useState<{ loading: boolean; available: bigint; trustline: boolean; unfunded: boolean }>({
    loading: false,
    available: 0n,
    trustline: true,
    unfunded: false,
  });
  const [nonce, setNonce] = useState(0);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!live || !sym || !address) {
        if (!cancelled) {
          setState({
            loading: false,
            available: sym ? getFixtureWalletBalance(sym) : 0n,
            trustline: true,
            unfunded: false,
          });
        }
        return;
      }
      if (!cancelled) setState((s) => ({ ...s, loading: true }));
      const result = await readWalletBalance(sym, address);
      if (cancelled) return;
      if (!result.ok) {
        // A failed LIVE read falls back to **zero**, never to the fixture: on a configured network the
        // fixture is not a fallback, it is a lie — it would offer a 9,076 USDC deposit the user cannot
        // make, and the transaction would fail on-chain. Zero is honest, and the faucet is still there.
        console.error(`[wallet-balance] ${result.message}`);
        setState({ loading: false, available: 0n, trustline: true, unfunded: false });
        return;
      }
      setState({
        loading: false,
        available: result.value.amount,
        trustline: result.value.trustline,
        unfunded: result.value.unfunded,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [live, sym, address, nonce]);

  return { ...state, live, refresh };
}
