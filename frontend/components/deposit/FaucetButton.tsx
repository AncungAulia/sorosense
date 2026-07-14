"use client";
import { useState } from "react";
import type { Currency } from "@sorosense/vault-client";
import { Button } from "../ui";
import { apiEnabled } from "../../lib/api/config";
import { apiPost, type ApiResult } from "../../lib/api/client";
import { isFaucetNeedsChangeTrust, type FaucetSuccess } from "../../lib/api/types";
import { balanceEnabled } from "../../lib/wallet/balance";
import { stablecoinByCurrency } from "../../lib/vault/data";
import { useWallet } from "../../hooks/useWallet";
import { useToast } from "../../hooks/useToast";

/**
 * "Get test funds" — `POST /faucet` (R6, STE-46).
 *
 * **Secret hygiene.** The body is exactly `{ address, currency }`: no key, and no amount the client gets
 * to pick (the backend decides how much it mints). `FAUCET_ISSUER_SECRET` lives on the backend and only
 * a public tx hash comes back. A test asserts the serialized body, so no refactor can smuggle a field in.
 *
 * **When it exists.** Three conditions, all necessary: the backend API is configured, the currency is one
 * the faucet mints (USD/EUR — MXN has no self-issued testnet asset), and this stablecoin's Horizon +
 * issuer config is present. The last one is not decoration: the 409 recovery path *builds a
 * `changeTrust` from the issuer*, so without it the button could only ever fail — the three env vars are
 * independently optional (`.env.example`), and an API-only build must not render a control that cannot
 * work. A `404` (no faucet route on this backend — mainnet, or no faucet env) removes it after the fact.
 *
 * **The recovery path.** `409 needsChangeTrust` ⇒ the recipient has no trustline for the SAC's underlying
 * classic asset. We build the `changeTrust`, sign it in the wallet, submit it, and retry the mint
 * **exactly once** — an unbounded retry against a rate-limited endpoint is the failure mode here.
 */
export function FaucetButton({ currency, onMinted }: { currency: Currency; onMinted?: () => void }) {
  const { address, signTransaction } = useWallet();
  const { show } = useToast();
  const [busy, setBusy] = useState(false);
  const [unmounted, setUnmounted] = useState(false); // a 404: the route is not mounted on this backend

  const coin = stablecoinByCurrency(currency);
  const mintable = currency === "USD" || currency === "EUR";
  const configured = coin !== undefined && balanceEnabled(coin.sym);
  if (!apiEnabled() || !mintable || !configured || !address || !coin || unmounted) return null;

  const mint = (): Promise<ApiResult<FaucetSuccess>> =>
    apiPost<FaucetSuccess>("/faucet", { address, currency });

  const succeed = () => {
    show(`Test ${coin.sym} on the way — your balance updates in a moment.`);
    onMinted?.(); // re-read the balance (it polls: Horizon needs a ledger close to see the payment)
  };

  const onClick = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const first = await mint();
      if (first.ok) return succeed();

      if (first.status === 404) {
        // No faucet on this backend. Say so, then remove a control that cannot work — a button that
        // silently vanishes under the user's finger is worse than no button.
        show("This backend has no faucet — ask for testnet funds another way.");
        setUnmounted(true);
        return;
      }
      if (first.status === 429) {
        show("Faucet is rate-limited. Try again in a minute.");
        return; // deliberately no retry — the backend cools down per address
      }

      if (first.status === 409 && isFaucetNeedsChangeTrust(first.body)) {
        try {
          // Loaded on demand: `changeTrust` pulls in @stellar/stellar-sdk, and this component is mounted
          // on Home (via AddFundsDrawer) where it usually renders nothing. Keep the SDK out of that bundle.
          const { addTrustline } = await import("../../lib/wallet/changeTrust");
          await addTrustline(coin.sym, address, signTransaction);
        } catch (cause) {
          // A declined signature (or a rejected trustline tx) ends the flow: no mint is attempted.
          console.error("[faucet] changeTrust failed:", cause);
          show("Trustline not added, so no test funds were sent.");
          return;
        }
        const retry = await mint(); // exactly once
        if (retry.ok) return succeed();
        show("Couldn't send test funds. Try again in a moment.");
        return;
      }

      show("Couldn't send test funds. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  };

  // The primitive is used as-is (primitives-DRY): no size override, which Tailwind's stylesheet order
  // would drop on the floor anyway — the wrapper is what shapes the slot.
  return (
    <div className="mx-auto mb-4 mt-2 w-full max-w-[240px]">
      <Button variant="glass" onClick={onClick} disabled={busy}>
        {busy ? "Sending test funds…" : `Get test ${coin.sym}`}
      </Button>
    </div>
  );
}
