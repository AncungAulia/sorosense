"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Currency, TxResult } from "@sorosense/vault-client";
import { Button, CountUp, Keypad, SubHeader, CoinBadge, Skeleton } from "../ui";
import { ConsentSheet } from "./ConsentSheet";
import { useVault } from "../../hooks/useVault";
import { useWallet } from "../../hooks/useWallet";
import { useWalletBalance } from "../../hooks/useWalletBalance";
import { useTransferFlow } from "../../hooks/useTransferFlow";
import { depositorSigner } from "../../lib/vault/signer";
import { toAmount, fromAmount, formatCurrency, UNIT } from "../../lib/vault/units";
import { stablecoinBySym } from "../../lib/vault/data";
import { recordDeposit } from "../../lib/vault/contributions";
import { shortTxHash, stellarTransactionUrl } from "../../lib/vault/explorer";

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
  const [busy, setBusy] = useState(false); // guards the async consent check before the flow starts
  const [txHash, setTxHash] = useState("");
  const flow = useTransferFlow();
  // The real trustline balance when Horizon + the issuer are configured; the fixture otherwise (R6).
  // `coin` may be undefined for a typo'd deep link — the hook still runs unconditionally.
  const balance = useWalletBalance(coin?.sym ?? null);

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
          <Button onClick={() => router.push("/deposit")}>Choose an asset</Button>
        </div>
      </div>
    );
  }

  const available = balance.available;
  const entered = toAmount(amount);
  const exceeded = entered > available;

  const quick = (pct: number) => {
    setAmount(fromAmount(BigInt(Math.floor(Number(available) * pct))));
  };

  const doDeposit = async (): Promise<TxResult | undefined> => {
    if (!address) return;
    const deposited = toAmount(amount);
    const result = await client.deposit(address, currency, deposited).signAndSubmit(depositorSigner(address, signTransaction));
    setTxHash(result.hash);
    // A resolved write is not a confirmed one — the seam reports a rejected transaction as
    // `success: false`. Cost basis is recorded only for a deposit the chain actually took (R5).
    if (result.success) recordDeposit(currency, deposited); // cost-basis for "Total earned" on Earn
    return result;
  };

  const onConfirm = async () => {
    if (busy || flow.phase !== "idle" || !address || entered <= 0n || exceeded) return;
    setBusy(true);
    try {
      if (!(await client.hasConsent(address))) { setConsentOpen(true); return; }
      await flow.run(doDeposit);
    } finally {
      setBusy(false);
    }
  };

  const onAgree = () => {
    if (!address) return;
    setConsentOpen(false);
    void flow.run(async () => {
      const consent = await client.setPolicyConsent(address).signAndSubmit(depositorSigner(address, signTransaction));
      // Stop if the mandate did not land: depositing without it panics on-chain (NoConsent), and a
      // failed consent must surface as a failure rather than a second doomed signature request.
      if (!consent.success) return consent;
      return doDeposit();
    });
  };

  // Sending / success / error status — the flow's screen replaces the form.
  if (flow.phase !== "idle") {
    const success = flow.phase === "success";
    if (success) {
      return (
        <div className="page-enter transfer-status-screen flex min-h-[calc(100dvh-92px)] flex-col">
          <div className="transfer-status-header relative flex h-11 items-center justify-center">
            <button
              aria-label="Close"
              onClick={() => router.push("/home")}
              className="absolute left-0 grid h-[42px] w-[42px] place-items-center rounded-full border border-white bg-card [box-shadow:0_1px_2px_rgba(17,19,22,.04),0_8px_18px_-10px_rgba(17,19,22,.18)]"
            >
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
            <h1 className="text-lg font-semibold">Deposit Status</h1>
          </div>

          <div className="stagger flex flex-1 flex-col">
            <div className="transfer-status-hero flex flex-col items-center text-center">
              <div className="transfer-status-icon-outer grid place-items-center rounded-full bg-[rgba(22,163,74,.07)]">
                <div className="transfer-status-icon-mid grid place-items-center rounded-full bg-[rgba(22,163,74,.13)]">
                  <div className="transfer-status-icon-core grid place-items-center rounded-full bg-pos text-white [box-shadow:0_18px_38px_-18px_rgba(22,163,74,.9)]">
                    <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                </div>
              </div>
              <h2 className="transfer-status-title text-[22px] font-semibold leading-tight tracking-[-.01em]">Deposit Success</h2>
              <p className="mt-2 text-[14.5px] text-muted">Your fund is now earning</p>
            </div>

            <div className="transfer-status-details w-full px-1 text-[15px]">
              <div className="transfer-status-row flex items-center justify-between gap-4">
                <span className="text-muted">Total deposited</span>
                <span className="font-semibold [font-variant-numeric:tabular-nums]">{formatCurrency(entered, currency)}</span>
              </div>
              <div className="transfer-status-row flex items-center justify-between gap-4">
                <span className="text-muted">Deposited asset</span>
                <span className="font-semibold">{coin.sym}</span>
              </div>
              <div className="transfer-status-row flex items-center justify-between gap-4">
                <span className="text-muted">Transaction hash</span>
                {txHash ? (
                  <a
                    href={stellarTransactionUrl(txHash)}
                    target="_blank"
                    rel="noreferrer noopener"
                    aria-label="Open transaction hash in explorer"
                    className="inline-flex max-w-[180px] items-center justify-end gap-1.5 font-mono text-[13.5px] font-semibold text-muted underline decoration-[#a6a6a6]/45 underline-offset-4 transition-colors hover:text-ink hover:decoration-[#808080] [font-variant-numeric:tabular-nums]"
                  >
                    <span className="truncate">{shortTxHash(txHash)}</span>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
                      <path d="M7 17 17 7" />
                      <path d="M9 7h8v8" />
                    </svg>
                  </a>
                ) : (
                  <span className="max-w-[170px] truncate font-mono text-[13.5px] font-semibold [font-variant-numeric:tabular-nums]">Pending</span>
                )}
              </div>
              <div className="transfer-status-separator border-t border-dashed border-line">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted">Status</span>
                  <span className="font-semibold text-pos">
                    Success
                  </span>
                </div>
              </div>
            </div>

            <Button className="transfer-status-cta" onClick={() => router.push("/home")}>Back to Home</Button>
          </div>
        </div>
      );
    }

    if (flow.phase === "sending") {
      return (
        <div className="page-enter flex min-h-[calc(100dvh-92px)] flex-col">
          <div className="relative mb-4 flex h-11 items-center justify-center">
            <h1 className="text-lg font-semibold">Deposit {coin.sym}</h1>
          </div>
          <div className="stagger flex flex-1 flex-col items-center">
            <div className="mt-24 flex flex-col items-center text-center">
              <div className="relative grid h-[146px] w-[146px] place-items-center rounded-full bg-[rgba(17,19,22,.04)]">
                <div className="grid h-[112px] w-[112px] place-items-center rounded-full bg-[rgba(17,19,22,.055)]">
                  <div className="grid h-[76px] w-[76px] place-items-center rounded-full bg-card [box-shadow:0_1px_2px_rgba(17,19,22,.04),0_18px_36px_-22px_rgba(17,19,22,.34)]">
                    <svg
                      width="34"
                      height="34"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2.1}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                      className="animate-[send-plane_1.15s_ease-in-out_infinite] text-ink"
                    >
                      <path d="M21 3 10 14" />
                      <path d="m21 3-7 18-4-7-7-4 18-7Z" />
                    </svg>
                  </div>
                </div>
              </div>
              <h2 className="mt-7 text-[21px] font-semibold leading-tight tracking-[-.01em]">Sending deposit</h2>
              <p className="mt-2 max-w-[260px] text-sm leading-relaxed text-muted">
                Keep this screen open until your deposit is sent.
              </p>
            </div>

          </div>
        </div>
      );
    }

    if (flow.phase === "error") {
      return (
        <div className="page-enter flex min-h-[calc(100dvh-92px)] flex-col">
          <div className="relative mb-4 flex h-11 items-center justify-center">
            <h1 className="text-lg font-semibold">Deposit Status</h1>
          </div>

          <div className="stagger flex flex-1 flex-col">
            <div className="mt-10 flex flex-col items-center text-center">
              <div className="grid h-[158px] w-[158px] place-items-center rounded-full bg-[rgba(192,69,59,.07)]">
                <div className="grid h-[124px] w-[124px] place-items-center rounded-full bg-[rgba(192,69,59,.12)]">
                  <div className="grid h-[86px] w-[86px] place-items-center rounded-full bg-neg text-white [box-shadow:0_18px_38px_-18px_rgba(192,69,59,.78)]">
                    <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.25} strokeLinecap="round" aria-hidden="true">
                      <path d="M6 6l12 12M18 6 6 18" />
                    </svg>
                  </div>
                </div>
              </div>
              <h2 className="mt-6 text-[22px] font-semibold leading-tight tracking-[-.01em]">Deposit Failed</h2>
              <p className="mt-2 max-w-[270px] text-[14.5px] leading-relaxed text-muted">
                Your deposit was not sent. No funds moved from your wallet.
              </p>
            </div>

            <Button className="mt-auto" onClick={() => router.push("/deposit")}>Back to Deposit</Button>
          </div>
        </div>
      );
    }

    return null;
  }

  return (
    <div className="flex min-h-[calc(100dvh-92px)] flex-col">
      <SubHeader title={`Deposit ${coin.sym}`} />
      <div className="mb-1.5 text-center">
        <span className="inline-flex h-10 items-center gap-2.5 rounded-full bg-[#ECECEC] pl-2.5 pr-4 text-[15px] font-semibold">
          <CoinBadge token={coin.sym} size={22} />
          {balance.loading ? (
            <Skeleton className="h-4 w-20 rounded-md" />
          ) : (
            <CountUp
              animateOnMount
              value={Number(available) / Number(UNIT)}
              format={(n) => `${symbol}${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            />
          )}
        </span>
      </div>
      {frozen && (
        <div className="mx-auto mt-0.5 flex max-w-[330px] items-center gap-2 rounded-[14px] bg-warn-soft px-3.5 py-2.5 text-[12.5px] font-medium leading-[1.35] text-warn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><path d="M12 9v4M12 17h.01" /></svg>
          Your {coin.sym} pool is paused. New deposits go to a safe pool.
        </div>
      )}
      <Keypad value={amount} onChange={setAmount} symbol={symbol} onQuick={quick} invalid={exceeded} hint="Not enough balance" />
      <Button onClick={onConfirm} disabled={busy || exceeded || entered <= 0n}>Deposit fund</Button>
      <ConsentSheet open={consentOpen} onAgree={onAgree} onClose={() => setConsentOpen(false)} />
    </div>
  );
}
