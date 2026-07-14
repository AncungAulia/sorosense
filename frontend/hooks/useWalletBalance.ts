"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { balanceEnabled, readWalletBalance } from "../lib/wallet/balance";
import { getFixtureWalletBalance, type StablecoinSym } from "../lib/vault/data";
import { useWallet } from "./useWallet";

/**
 * The deposit surfaces' available balance (R6 · KTD2 · KTD7).
 *
 * Live when Horizon **and** this symbol's issuer are configured and a wallet is connected; the
 * `getFixtureWalletBalance` value otherwise — so vitest, Playwright and a bare `pnpm dev` keep today's
 * behavior with zero network. The fixture is resolved **during render**, not in the effect: reading it
 * in an effect would paint a $0.00 balance for one frame on every offline deposit screen, which the
 * pre-U4 synchronous `getWalletBalance(sym)` never did. The effect is only for the live read (KTD7 —
 * the fetch never runs at module scope).
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
  /** Re-read after a mint lands, so the deposit screen's available line actually moves. */
  refresh: () => void;
}

/**
 * A faucet mint is a *classic payment*: Horizon only reports it once the ledger closes and the payment
 * is ingested (~5s on testnet, sometimes more). A single immediate re-read would therefore almost always
 * read the pre-mint balance and the line would never move. So a `refresh()` polls a few times and stops
 * as soon as the number changes — bounded, so a mint that never lands cannot spin forever.
 */
const REFRESH_ATTEMPTS = 4;
const REFRESH_DELAY_MS = 2_500;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface LiveState {
  loading: boolean;
  amount: bigint;
  trustline: boolean;
  unfunded: boolean;
}

export function useWalletBalance(sym: StablecoinSym | null): WalletBalanceView {
  const { address } = useWallet();
  const live = sym !== null && balanceEnabled(sym) && Boolean(address);

  const [state, setState] = useState<LiveState>({ loading: false, amount: 0n, trustline: true, unfunded: false });
  const [nonce, setNonce] = useState(0);
  // What the last completed read saw — a refresh polls until the number moves off it.
  const lastAmount = useRef(0n);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!live || !sym || !address) return;

    let cancelled = false;
    void (async () => {
      setState((s) => ({ ...s, loading: true }));
      const before = lastAmount.current;
      // A first read (nonce 0) settles on its first result; a post-mint refresh waits for the change.
      const attempts = nonce === 0 ? 1 : REFRESH_ATTEMPTS;

      for (let attempt = 0; attempt < attempts; attempt++) {
        const result = await readWalletBalance(sym, address);
        if (cancelled) return;

        if (!result.ok) {
          // A failed LIVE read falls back to **zero**, never to the fixture: on a configured network the
          // fixture is not a fallback, it is a lie — it would offer a deposit the user cannot make, and
          // the transaction would fail on-chain. Zero is honest, and the faucet is still there.
          console.error(`[wallet-balance] ${result.message}`);
          lastAmount.current = 0n;
          setState({ loading: false, amount: 0n, trustline: true, unfunded: false });
          return;
        }

        const { amount, trustline, unfunded } = result.value;
        const settled = attempt === attempts - 1 || amount !== before;
        if (settled) {
          lastAmount.current = amount;
          setState({ loading: false, amount, trustline, unfunded });
          return;
        }
        await sleep(REFRESH_DELAY_MS); // the mint has not been ingested yet
        if (cancelled) return;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [live, sym, address, nonce]);

  // The fixture path never touches state — no effect, no first-paint flash, no request.
  if (!live) {
    return {
      loading: false,
      available: sym ? getFixtureWalletBalance(sym) : 0n,
      trustline: true,
      unfunded: false,
      live: false,
      refresh,
    };
  }

  return {
    loading: state.loading,
    available: state.amount,
    trustline: state.trustline,
    unfunded: state.unfunded,
    live: true,
    refresh,
  };
}
