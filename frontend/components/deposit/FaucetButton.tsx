"use client";
import { useEffect, useState } from "react";
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
/** Client-side cooldown after a successful claim (the backend also rate-limits, at 60s; this is longer
 *  and, unlike the backend limit, shows the user exactly when the next claim unlocks). */
const FAUCET_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour
const cooldownKey = (address: string) => `ss-faucet-until-${address}`;

/** ms → "hh:mm:ss". */
function formatCountdown(ms: number): string {
  const s = Math.ceil(ms / 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
}

export function FaucetButton({ currency, onMinted }: { currency: Currency; onMinted?: () => void }) {
  const { address, signTransaction } = useWallet();
  const { show } = useToast();
  const [busy, setBusy] = useState(false);
  const [unmounted, setUnmounted] = useState(false); // a 404: the route is not mounted on this backend
  // Cooldown, persisted per address so it survives a reload. `nowTs` ticks each second while counting down.
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [nowTs, setNowTs] = useState(0);

  // Reading the persisted cooldown (and the clock) is exactly what an effect is for: `localStorage` and
  // `Date.now()` do not exist during SSR, and lazy initial state cannot follow a changing `address`.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!address) return setCooldownUntil(0);
    setCooldownUntil(Number(localStorage.getItem(cooldownKey(address)) ?? 0));
    setNowTs(Date.now());
  }, [address]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (cooldownUntil <= Date.now()) return;
    const id = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [cooldownUntil]);

  const coin = stablecoinByCurrency(currency);
  const mintable = currency === "USD" || currency === "EUR";
  const configured = coin !== undefined && balanceEnabled(coin.sym);
  if (!apiEnabled() || !mintable || !configured || !address || !coin || unmounted) return null;

  const mint = (): Promise<ApiResult<FaucetSuccess>> =>
    apiPost<FaucetSuccess>("/faucet", { address, currency });

  const succeed = () => {
    show(`Test ${coin.sym} on the way — your balance updates in a moment.`);
    onMinted?.(); // re-read the balance (it polls: Horizon needs a ledger close to see the payment)
    if (address) {
      const until = Date.now() + FAUCET_COOLDOWN_MS;
      localStorage.setItem(cooldownKey(address), String(until));
      setCooldownUntil(until);
      setNowTs(Date.now());
    }
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

  const remaining = cooldownUntil - nowTs;
  const onCooldown = remaining > 0;

  // The primitive is used as-is (primitives-DRY): no size override, which Tailwind's stylesheet order
  // would drop on the floor anyway — the wrapper is what shapes the slot.
  return (
    <div className="mx-auto mb-4 mt-2 w-full max-w-[240px]">
      <Button variant="glass" onClick={onClick} disabled={busy || onCooldown}>
        {busy
          ? "Sending test funds…"
          : onCooldown
            ? `Next claim in ${formatCountdown(remaining)}`
            : `Get test ${coin.sym}`}
      </Button>
    </div>
  );
}
