"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { SHARE_PRICE_SCALE, type Currency, type TxResult } from "@sorosense/vault-client";
import { Button, Keypad, SubHeader, CoinBadge } from "../ui";
import { useBuckets } from "../../hooks/useBuckets";
import { useVault } from "../../hooks/useVault";
import { useWallet } from "../../hooks/useWallet";
import { useTransferFlow } from "../../hooks/useTransferFlow";
import { depositorSigner } from "../../lib/vault/signer";
import { toAmount, fromAmount, formatCurrency } from "../../lib/vault/units";
import { recordWithdraw } from "../../lib/vault/contributions";
import { stablecoinByCurrency } from "../../lib/vault/data";
import { shortTxHash, stellarTransactionUrl } from "../../lib/vault/explorer";

type SubmittedWithdraw = {
  amount: bigint;
  currency: Currency;
  asset: string;
};

export function WithdrawKeypad() {
  const router = useRouter();
  const { buckets } = useBuckets();
  const { client } = useVault();
  const { address, signTransaction } = useWallet();
  const [i, setI] = useState(0);
  const [amount, setAmount] = useState("0");
  const [maxSelected, setMaxSelected] = useState(false);
  const [txHash, setTxHash] = useState("");
  const [submitted, setSubmitted] = useState<SubmittedWithdraw | null>(null);
  const flow = useTransferFlow();

  // buckets only include currencies with a positive balance (useBuckets filters shares<=0), so any
  // index here is already a "has a positive balance" bucket.
  const active = buckets[i] ?? buckets[0];
  const symbol = active?.currency === "EUR" ? "€" : "$";
  const multi = buckets.length >= 2;
  const entered = toAmount(amount);
  const available = active?.value ?? 0n;
  const exceeded = !!active && entered > available;

  const chooseNextBucket = () => {
    if (!multi) return;
    setI((n) => (n + 1) % buckets.length);
    setAmount("0"); // reset the keypad — the previous bucket's amount doesn't carry over
    setMaxSelected(false);
  };

  const quick = (pct: number) => {
    if (!active) return;
    setAmount(fromAmount(BigInt(Math.floor(Number(active.value) * pct))));
  };

  const doWithdraw = async (): Promise<TxResult | undefined> => {
    if (!address || !active) return;
    const currency: Currency = active.currency;
    const enteredAmount = toAmount(amount);
    if (enteredAmount <= 0n) return;
    const isMax = maxSelected;
    // The seam's `withdraw` burns SHARES, but the UI is asset-denominated. Convert via the current
    // NAV: shares = amount * SCALE / sharePrice. For "Max" use the full share balance directly
    // (balanceOf) rather than converting the displayed asset value back to shares, to avoid leaving
    // rounding dust behind in the bucket.
    const shares = isMax
      ? await client.balanceOf(address, currency)
      : (enteredAmount * SHARE_PRICE_SCALE) / (await client.sharePrice(currency));
    if (shares <= 0n) return;
    const withdrawnAmount = isMax ? active.value : enteredAmount;
    setSubmitted({ amount: withdrawnAmount, currency, asset: stablecoinByCurrency(currency)?.sym ?? currency });
    const result = await client.withdraw(address, currency, shares).signAndSubmit(depositorSigner(address, signTransaction));
    setTxHash(result.hash);
    // The shares are still in the bucket if the chain rejected the burn — reducing the cost basis
    // then would inflate "Total earned" against funds that never left (R5).
    if (result.success) recordWithdraw(currency, withdrawnAmount); // reduce cost-basis
    return result;
  };

  const onConfirm = () => {
    if (flow.phase !== "idle" || !address || !active || exceeded || entered <= 0n) return;
    void flow.run(doWithdraw);
  };

  // Sending / success / error status screen replaces the form.
  if (flow.phase !== "idle") {
    const statusCurrency = submitted?.currency ?? active?.currency ?? "USD";
    const statusAsset = submitted?.asset ?? stablecoinByCurrency(statusCurrency)?.sym ?? statusCurrency;
    const statusAmount = submitted?.amount ?? (maxSelected ? available : entered);

    if (flow.phase === "success") {
      return (
        <div className="transfer-status-screen flex min-h-[calc(100dvh-92px)] flex-col">
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
            <h1 className="text-lg font-semibold">Withdrawal Status</h1>
          </div>

          <div className="flex flex-1 flex-col">
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
              <h2 className="transfer-status-title text-[22px] font-semibold leading-tight tracking-[-.01em]">Withdrawal Success</h2>
              <p className="mt-2 text-[14.5px] text-muted">Your funds are now in your wallet.</p>
            </div>

            <div className="transfer-status-details w-full px-1 text-[15px]">
              <div className="transfer-status-row flex items-center justify-between gap-4">
                <span className="text-muted">Total withdrawn</span>
                <span className="font-semibold [font-variant-numeric:tabular-nums]">{formatCurrency(statusAmount, statusCurrency)}</span>
              </div>
              <div className="transfer-status-row flex items-center justify-between gap-4">
                <span className="text-muted">Withdrawn asset</span>
                <span className="font-semibold">{statusAsset}</span>
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
                  <span className="font-semibold text-pos">Success</span>
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
        <div className="flex min-h-[calc(100dvh-92px)] flex-col">
          <div className="relative mb-4 flex h-11 items-center justify-center">
              <h1 className="text-lg font-semibold">Withdraw</h1>
          </div>
          <div className="flex flex-1 flex-col items-center">
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
              <h2 className="mt-7 text-[21px] font-semibold leading-tight tracking-[-.01em]">Sending withdrawal</h2>
              <p className="mt-2 max-w-[270px] text-sm leading-relaxed text-muted">
                Keep this screen open until your withdrawal is sent.
              </p>
            </div>
          </div>
        </div>
      );
    }

    if (flow.phase === "error") {
      return (
        <div className="flex min-h-[calc(100dvh-92px)] flex-col">
          <div className="relative mb-4 flex h-11 items-center justify-center">
            <h1 className="text-lg font-semibold">Withdrawal Status</h1>
          </div>

          <div className="flex flex-1 flex-col">
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
              <h2 className="mt-6 text-[22px] font-semibold leading-tight tracking-[-.01em]">Withdrawal Failed</h2>
              <p className="mt-2 max-w-[280px] text-[14.5px] leading-relaxed text-muted">
                Your withdrawal was not sent. No funds moved from your bucket.
              </p>
            </div>

            <Button className="mt-auto" onClick={flow.reset}>Back to Withdraw</Button>
          </div>
        </div>
      );
    }

    return null;
  }

  return (
    <div className="flex min-h-[calc(100dvh-92px)] flex-col">
      <SubHeader title="Withdraw" />
      <div className="mb-1 text-center">
        <button
          aria-label="Choose bucket"
          onClick={chooseNextBucket}
          className="inline-flex h-10 items-center gap-2.5 rounded-full bg-[#ECECEC] pl-2.5 pr-4 text-[15px] font-semibold"
        >
          <CoinBadge currency={active?.currency ?? "USD"} size={22} />
          {active?.name ?? "USD bucket"}
          {multi && (
            <svg
              data-testid="bucket-chevron"
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M8 9l4-4 4 4M8 15l4 4 4-4" />
            </svg>
          )}
        </button>
      </div>
      <div className="mb-0.5 text-center text-[12.5px] text-muted">
        {active ? `${formatCurrency(active.value, active.currency)} available` : "No bucket selected"}
      </div>
      <Keypad
        value={amount}
        onChange={(next) => {
          setMaxSelected(false);
          setAmount(next);
        }}
        symbol={symbol}
        onQuick={(pct) => {
          setMaxSelected(pct === 1);
          quick(pct);
        }}
        invalid={exceeded}
        hint="Not enough balance"
      />
      <Button onClick={onConfirm} disabled={exceeded || !active || entered <= 0n}>Withdraw</Button>
    </div>
  );
}
