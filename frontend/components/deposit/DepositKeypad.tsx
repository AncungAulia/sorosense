"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Currency } from "@sorosense/vault-client";
import { Button, Keypad, Toast, SubHeader, CoinBadge } from "../ui";
import { ConsentSheet } from "./ConsentSheet";
import { useVault } from "../../hooks/useVault";
import { useWallet } from "../../hooks/useWallet";
import { depositorSigner } from "../../lib/vault/signer";
import { toAmount, fromAmount, formatCurrency } from "../../lib/vault/units";
import { stablecoinBySym, getWalletBalance, type StablecoinSym } from "../../lib/vault/data";
import { toWalletError, USER_CLOSED_MODAL } from "../../lib/wallet-error";

export function DepositKeypad({ sym }: { sym: string }) {
  const router = useRouter();
  const { client, version } = useVault();
  const { address, signTransaction } = useWallet();
  const coin = stablecoinBySym(sym);
  // `currency` is only meaningful for a known coin — never used as a real bucket target
  // when `coin` is undefined (see the `!coin` early return in the render below).
  const currency: Currency = coin?.currency ?? "USD";
  const symbol = currency === "EUR" ? "€" : "$";

  const [amount, setAmount] = useState("0");
  const [frozen, setFrozen] = useState(false);
  const [consentOpen, setConsentOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const pool = await client.activePool(currency);
      const isFrozen = pool ? (await client.poolStatus(pool)) === "frozen" : false;
      if (!cancelled) setFrozen(isFrozen);
    })();
    return () => { cancelled = true; };
    // `version` bumps once the background seed (which may freeze a pool) completes after
    // wallet connect — without it a deep-link render can read poolStatus before the seed
    // lands and wrongly show no amber note (mirrors the fix in useBuckets).
  }, [client, currency, version]);

  // Unknown sym (e.g. a typo'd deep link `/deposit/xyz`): refuse rather than silently
  // defaulting into the USD bucket. All hooks above have already run unconditionally.
  if (!coin) {
    return (
      <div className="flex min-h-[calc(100dvh-92px)] flex-col">
        <SubHeader title="Deposit" />
        <p className="mt-6 text-center text-[13px] text-muted">Unknown asset.</p>
        <div className="mt-auto">
          <Button onClick={() => router.push("/add-funds")}>Choose an asset</Button>
        </div>
      </div>
    );
  }

  const available = getWalletBalance(coin.sym as StablecoinSym);
  const entered = toAmount(amount);
  const exceeded = entered > available;

  const quick = (pct: number) => {
    setAmount(fromAmount(BigInt(Math.floor(Number(available) * pct))));
  };

  const runDeposit = async () => {
    if (!address) return;
    const signer = depositorSigner(address, signTransaction);
    await client.deposit(address, currency, toAmount(amount)).signAndSubmit(signer);
    setToast("Deposited. Agent is allocating.");
    router.push("/home");
  };

  const onConfirm = async () => {
    if (inFlight.current || !address || busy || entered <= 0n || exceeded) return;
    inFlight.current = true;
    setBusy(true);
    try {
      if (!(await client.hasConsent(address))) { setConsentOpen(true); return; }
      await runDeposit();
    } catch (e) {
      const w = toWalletError(e);
      if (w.code !== USER_CLOSED_MODAL) setToast(w.message); // user closed modal → silent
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  };

  const onAgree = async () => {
    if (inFlight.current || !address) return;
    inFlight.current = true;
    setConsentOpen(false); setBusy(true);
    try {
      const signer = depositorSigner(address, signTransaction);
      await client.setPolicyConsent(address).signAndSubmit(signer);
      await runDeposit();
    } catch (e) {
      const w = toWalletError(e);
      if (w.code !== USER_CLOSED_MODAL) setToast(w.message);
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  };

  return (
    <div className="flex min-h-[calc(100dvh-92px)] flex-col">
      <SubHeader title={`Deposit ${coin?.sym ?? sym.toUpperCase()}`} />
      <div className="mb-1.5 text-center">
        <span className="inline-flex h-10 items-center gap-2.5 rounded-full bg-[#ECECEC] pl-2.5 pr-4 text-[15px] font-semibold">
          <CoinBadge token={coin.sym} size={22} />
          {formatCurrency(getWalletBalance((coin?.sym ?? "USDC") as StablecoinSym), currency)}
        </span>
      </div>
      {frozen && (
        <div className="mx-auto mt-0.5 flex max-w-[330px] items-center gap-2 rounded-[14px] bg-warn-soft px-3.5 py-2.5 text-[12.5px] font-medium leading-[1.35] text-warn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><path d="M12 9v4M12 17h.01" /></svg>
          Your {coin?.sym ?? sym.toUpperCase()} pool is paused. New deposits go to a safe pool.
        </div>
      )}
      <Keypad value={amount} onChange={setAmount} symbol={symbol} onQuick={quick} invalid={exceeded} />
      {exceeded && <p className="mb-2 text-center text-[13px] font-medium text-neg">Not enough balance</p>}
      <Button onClick={onConfirm} disabled={busy || exceeded || entered <= 0n}>Deposit fund</Button>
      <ConsentSheet open={consentOpen} onAgree={onAgree} onClose={() => setConsentOpen(false)} />
      <Toast open={!!toast} message={toast ?? ""} />
    </div>
  );
}
