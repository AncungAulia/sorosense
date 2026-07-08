"use client";
import { useEffect, useState } from "react";
import type { Currency, ExitProposal } from "@sorosense/vault-client";
import { useWallet } from "./useWallet";
import { useVault } from "./useVault";
import { STABLECOINS, getPoolMeta } from "../lib/vault/data";

const CURRENCIES: readonly Currency[] = ["USD", "EUR", "MXN"];

export interface PendingExitView {
  currency: Currency;
  proposal: ExitProposal | null;
  fromLabel: string;
  amount: bigint;
  toMeta: { name: string; apy: number } | null;
}

/**
 * The single source of truth for the freeze banner's visibility and the ExitApproval sheet's
 * content. Finds the first currency whose active pool is frozen, then reads its pending exit
 * proposal and live bucket value. Returns null when nothing is frozen (banner hidden). A frozen
 * bucket with no proposal yet returns a view with `proposal: null` (the interstitial state).
 */
export function usePendingExit(): PendingExitView | null {
  const { address } = useWallet();
  const { client, version } = useVault();
  const [view, setView] = useState<PendingExitView | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!address) {
        if (!cancelled) setView(null);
        return;
      }
      for (const currency of CURRENCIES) {
        const pool = await client.activePool(currency);
        if (!pool || (await client.poolStatus(pool)) !== "frozen") continue;
        const proposal = await client.pendingExit(currency);
        const amount = await client.assetValueOf(address, currency);
        const sym = STABLECOINS.find((s) => s.currency === currency)?.sym ?? currency;
        const toMeta = proposal ? getPoolMeta(proposal.toPool) : null;
        if (!cancelled) setView({ currency, proposal, fromLabel: `Paused ${sym} pool`, amount, toMeta });
        return;
      }
      if (!cancelled) setView(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [address, client, version]);

  return view;
}
