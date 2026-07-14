"use client";
import { useState } from "react";
import type { Currency } from "@sorosense/vault-client";
import { Button } from "../ui";
import { apiEnabled } from "../../lib/api/config";
import { apiPost, type ApiResult } from "../../lib/api/client";
import { isFaucetNeedsChangeTrust, type FaucetSuccess } from "../../lib/api/types";
import { addTrustline } from "../../lib/wallet/changeTrust";
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
 * The button **does not exist** unless the API is configured and the currency is one the faucet mints
 * (USD/EUR — MXN has no self-issued testnet asset). A `404` means the backend mounted no faucet route
 * (mainnet, or no faucet env), so it removes itself rather than leaving a dead control on screen.
 *
 * The recovery path: `409 needsChangeTrust` ⇒ the recipient has no trustline for the SAC's underlying
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
  if (!apiEnabled() || !mintable || !address || !coin || unmounted) return null;

  const mint = (): Promise<ApiResult<FaucetSuccess>> =>
    apiPost<FaucetSuccess>("/faucet", { address, currency });

  const succeed = () => {
    show(`Test ${coin.sym} sent to your wallet.`);
    onMinted?.(); // re-read the balance: the keypad's available line has to move
  };

  const onClick = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const first = await mint();
      if (first.ok) return succeed();

      if (first.status === 404) {
        // No faucet on this backend. Hide the control instead of surfacing a button that cannot work.
        setUnmounted(true);
        return;
      }
      if (first.status === 429) {
        show("Faucet is rate-limited. Try again in a minute.");
        return; // deliberately no retry — the backend cools down per address
      }

      if (first.status === 409 && isFaucetNeedsChangeTrust(first.body)) {
        try {
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

  // The component owns its slot: a call site can drop it in unconditionally without leaving an empty
  // wrapper behind on the (common) runs where it renders nothing.
  return (
    <div className="mx-auto mb-4 mt-2 w-full max-w-[240px]">
      <Button variant="glass" onClick={onClick} disabled={busy} className="h-11 text-[14px]">
        {busy ? "Sending test funds…" : `Get test ${coin.sym}`}
      </Button>
    </div>
  );
}
