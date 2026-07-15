"use client";

import { useEffect, useState } from "react";
import type { Currency } from "@sorosense/vault-client";
import { Button } from "../ui";
import { apiEnabled } from "../../lib/api/config";
import { apiPost, type ApiResult } from "../../lib/api/client";
import { isFaucetNeedsChangeTrust, type FaucetSuccess } from "../../lib/api/types";
import { balanceEnabled } from "../../lib/wallet/balance";
import { stablecoinByCurrency } from "../../lib/vault/data";
import { fromAmount } from "../../lib/vault/units";
import { useWallet } from "../../hooks/useWallet";
import { useToast } from "../../hooks/useToast";

const FAUCET_COOLDOWN_MS = 60 * 60 * 1000;
const cooldownKey = (address: string, currency: Currency) => `ss-faucet-until-${address}-${currency}`;
const legacyCooldownKey = (address: string) => `ss-faucet-until-${address}`;

function formatCountdown(ms: number): string {
  const seconds = Math.ceil(ms / 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(seconds / 3600))}:${pad(Math.floor((seconds % 3600) / 60))}:${pad(seconds % 60)}`;
}

export function FaucetButton({
  currency,
  onMinted,
  compact = false,
  className = "",
  buttonClassName = "",
}: {
  currency: Currency;
  onMinted?: () => void;
  compact?: boolean;
  className?: string;
  buttonClassName?: string;
}) {
  const { address, signTransaction } = useWallet();
  const { show } = useToast();
  const [busy, setBusy] = useState(false);
  const [unmounted, setUnmounted] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [nowTs, setNowTs] = useState(0);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!address) return setCooldownUntil(0);
    const key = cooldownKey(address, currency);
    let stored = localStorage.getItem(key);
    if (!stored && currency === "USD") {
      stored = localStorage.getItem(legacyCooldownKey(address));
      if (stored) localStorage.setItem(key, stored);
    }
    setCooldownUntil(Number(stored ?? 0));
    setNowTs(Date.now());
  }, [address, currency]);
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

  const succeed = (result: FaucetSuccess) => {
    show(`Successfully minted ${fromAmount(BigInt(result.amount))} ${coin.sym}`);
    onMinted?.();
    if (address) {
      const until = Date.now() + FAUCET_COOLDOWN_MS;
      localStorage.setItem(cooldownKey(address, currency), String(until));
      setCooldownUntil(until);
      setNowTs(Date.now());
    }
  };

  const onClick = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const first = await mint();
      if (first.ok) return succeed(first.value);

      if (first.status === 404) {
        show("This backend has no faucet - ask for testnet funds another way.");
        setUnmounted(true);
        return;
      }
      if (first.status === 429) {
        show("Faucet is rate-limited. Try again in a minute.");
        return;
      }

      if (first.status === 409 && isFaucetNeedsChangeTrust(first.body)) {
        try {
          const { addTrustline } = await import("../../lib/wallet/changeTrust");
          await addTrustline(coin.sym, address, signTransaction);
        } catch (cause) {
          console.error("[faucet] changeTrust failed:", cause);
          show("Trustline not added, so no test funds were sent.");
          return;
        }
        const retry = await mint();
        if (retry.ok) return succeed(retry.value);
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
  const label = busy
    ? compact ? "Minting..." : "Sending test funds..."
    : onCooldown
      ? compact ? formatCountdown(remaining) : `Next claim in ${formatCountdown(remaining)}`
      : compact ? "Mint" : `Get test ${coin.sym}`;

  return (
    <div className={compact ? `m-0 w-auto shrink-0 ${className}` : `mx-auto mb-4 mt-2 w-full max-w-[240px] ${className}`}>
      <Button
        variant={compact ? "ink" : "glass"}
        onClick={onClick}
        disabled={busy || onCooldown}
        className={compact ? `h-9! w-auto! px-4! text-[13px]! ${buttonClassName}` : buttonClassName}
      >
        {label}
      </Button>
    </div>
  );
}
