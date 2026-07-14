"use client";
import { useEffect, useState } from "react";
import type { Currency, ExitProposal } from "@sorosense/vault-client";
import { useWallet } from "./useWallet";
import { useVault } from "./useVault";
import { apiEnabled } from "../lib/api/config";
import { apiGet } from "../lib/api/client";
import type { Pool } from "../lib/api/types";
import { STABLECOINS, getPoolMeta } from "../lib/vault/data";

const CURRENCIES: readonly Currency[] = ["USD", "EUR", "MXN"];

export interface PendingExitView {
  currency: Currency;
  proposal: ExitProposal | null;
  fromLabel: string;
  sym: string;
  amount: bigint;
  toMeta: { name: string; apy: number } | null;
}

/**
 * Name + rate of the pool the Sentinel proposes moving the money **to** (R13).
 *
 * Two honest sources, one gate — and the two id spaces are genuinely different, which is why the
 * fixture cannot simply be deleted:
 *  - **Real mode** ⇒ `GET /pools/:id`. `proposal.toPool` came off the chain as a seam `PoolId`
 *    (`blend-eurc`), a slug `POOL_META` has never heard of: that two-entry map knows nothing about the
 *    pool the keeper actually proposed. Only the backend's catalog can name it.
 *  - **Offline** ⇒ `POOL_META`, whose ids are the local seed's (`pool-defindex-eur`).
 *
 * A failed read (a dead backend, or a pool the catalog does not carry — the route 404s rather than
 * returning `null`) falls back to the fixture, which yields `null` for an unknown id. The sheet then
 * renders its unnamed-target state; it never invents a name for a pool it could not resolve.
 */
async function resolveExitTarget(poolId: string): Promise<{ name: string; apy: number } | null> {
  if (!apiEnabled()) return getPoolMeta(poolId);

  const result = await apiGet<Pool>(`/pools/${encodeURIComponent(poolId)}`);
  if (result.ok) return { name: result.value.name, apy: result.value.apy };

  // Never swallowed, never fatal: an unresolvable target degrades the sheet, it does not blank it.
  console.error(`[pools] ${result.code}: ${result.message}`);
  return getPoolMeta(poolId);
}

/**
 * The single source of truth for the freeze banner's visibility and the ExitApproval sheet's
 * content. Finds the first currency whose active pool is frozen, then reads its pending exit
 * proposal and live bucket value. Returns null when nothing is frozen (banner hidden). A frozen
 * bucket with no proposal yet returns a view with `proposal: null` (the interstitial state).
 *
 * The frozen/value reads come from the **seam** in both modes (the browser signs against the same vault
 * it reads); only the exit target's display data crosses the HTTP boundary — see {@link resolveExitTarget}.
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
        const toMeta = proposal ? await resolveExitTarget(proposal.toPool) : null;
        if (!cancelled) setView({ currency, proposal, fromLabel: `Paused ${sym} pool`, sym, amount, toMeta });
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
