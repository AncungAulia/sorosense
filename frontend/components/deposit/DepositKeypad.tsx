"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Currency } from "@sorosense/vault-client";
import { Button, Keypad, Toast, SubHeader } from "../ui";
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

  const quick = (pct: number) => {
    if (!coin) return;
    const max = getWalletBalance(coin.sym as StablecoinSym);
    setAmount(fromAmount(BigInt(Math.floor(Number(max) * pct))));
  };

  const runDeposit = async () => {
    if (!address) return;
    const signer = depositorSigner(address, signTransaction);
    await client.deposit(address, currency, toAmount(amount)).signAndSubmit(signer);
    setToast("Deposited. Agent is allocating.");
    router.push("/home");
  };

  const onConfirm = async () => {
    if (inFlight.current || !address || busy || toAmount(amount) <= 0n) return;
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
    <div className="flex min-h-[calc(100dvh-52px)] flex-col">
      <SubHeader title={`Deposit ${coin?.sym ?? sym.toUpperCase()}`} />
      <div className="mb-1.5 text-center">
        <span className="inline-flex h-10 items-center gap-2.5 rounded-full bg-[#ECECEC] pl-2.5 pr-4 text-[15px] font-semibold">
          <span className="grid h-[22px] w-[22px] place-items-center rounded-full bg-white text-[9px] font-semibold">{currency}</span>
          {formatCurrency(getWalletBalance((coin?.sym ?? "USDC") as StablecoinSym), currency)}
        </span>
      </div>
      {frozen && (
        <div className="mx-auto mt-0.5 flex max-w-[330px] items-center gap-2 rounded-[14px] bg-warn-soft px-3.5 py-2.5 text-[12.5px] font-medium leading-[1.35] text-warn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><path d="M12 9v4M12 17h.01" /></svg>
          Your {coin?.sym ?? sym.toUpperCase()} pool is paused. New deposits go to a safe pool.
        </div>
      )}
      <Keypad value={amount} onChange={setAmount} symbol={symbol} onQuick={quick} />
      <Button onClick={onConfirm}>Deposit fund</Button>
      <p className="mt-3 text-center text-[12.5px] text-muted">
        Goes to your {currency} bucket. No conversion. The agent allocates to the safest highest yield in this currency.
      </p>
      <ConsentSheet open={consentOpen} onAgree={onAgree} onClose={() => setConsentOpen(false)} />
      <Toast open={!!toast} message={toast ?? ""} />
    </div>
  );
}
