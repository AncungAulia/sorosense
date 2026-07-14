"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { SHARE_PRICE_SCALE, type Currency } from "@sorosense/vault-client";
import { Button, Keypad, SubHeader, CoinBadge, TransferStatus } from "../ui";
import { useBuckets } from "../../hooks/useBuckets";
import { useVault } from "../../hooks/useVault";
import { useWallet } from "../../hooks/useWallet";
import { useTransferFlow } from "../../hooks/useTransferFlow";
import { depositorSigner } from "../../lib/vault/signer";
import { toAmount, fromAmount, formatCurrency } from "../../lib/vault/units";
import { recordWithdraw } from "../../lib/vault/contributions";

export function WithdrawKeypad() {
  const router = useRouter();
  const { buckets } = useBuckets();
  const { client } = useVault();
  const { address, signTransaction } = useWallet();
  const [i, setI] = useState(0);
  const [amount, setAmount] = useState("0");
  const [maxSelected, setMaxSelected] = useState(false);
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

  const doWithdraw = async () => {
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
    await client.withdraw(address, currency, shares).signAndSubmit(depositorSigner(address, signTransaction));
    recordWithdraw(currency, isMax ? active.value : enteredAmount); // reduce cost-basis
  };

  const onConfirm = () => {
    if (flow.phase !== "idle" || !address || !active || exceeded || entered <= 0n) return;
    void flow.run(doWithdraw);
  };

  // Sending / success / error status — the flow's screen replaces the form.
  if (flow.phase !== "idle") {
    return (
      <div className="flex min-h-[calc(100dvh-92px)] flex-col">
        <SubHeader title="Move to wallet" />
        <TransferStatus
          phase={flow.phase}
          sendingLabel="Sending to your wallet…"
          successTitle="Sent to your wallet"
          successMessage="Your funds are on the way to your wallet."
          onDone={() => router.push("/home")}
          errorMessage={flow.error}
          onRetry={flow.retry}
          backLabel="Back to Move to wallet"
          onBack={flow.reset}
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100dvh-92px)] flex-col">
      <SubHeader title="Move to wallet" />
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
        {active ? `${formatCurrency(active.value, active.currency)} available` : "—"}
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
      <Button onClick={onConfirm} disabled={exceeded || !active || entered <= 0n}>Move to wallet</Button>
    </div>
  );
}
