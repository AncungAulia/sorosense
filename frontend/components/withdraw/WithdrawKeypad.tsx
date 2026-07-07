"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SHARE_PRICE_SCALE, type Currency } from "@sorosense/vault-client";
import { Button, Keypad, Toast, SubHeader } from "../ui";
import { useBuckets } from "../../hooks/useBuckets";
import { useVault } from "../../hooks/useVault";
import { useWallet } from "../../hooks/useWallet";
import { depositorSigner } from "../../lib/vault/signer";
import { toAmount, fromAmount, formatCurrency } from "../../lib/vault/units";
import { toWalletError, USER_CLOSED_MODAL } from "../../lib/wallet-error";

export function WithdrawKeypad() {
  const router = useRouter();
  const { buckets } = useBuckets();
  const { client } = useVault();
  const { address, signTransaction } = useWallet();
  const [i, setI] = useState(0);
  const [amount, setAmount] = useState("0");
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  // buckets only include currencies with a positive balance (useBuckets filters shares<=0), so any
  // index here is already a "has a positive balance" bucket.
  const active = buckets[i] ?? buckets[0];
  const symbol = active?.currency === "EUR" ? "€" : "$";
  const multi = buckets.length >= 2;

  const chooseNextBucket = () => {
    if (!multi) return;
    setI((n) => (n + 1) % buckets.length);
    setAmount("0"); // reset the keypad — the previous bucket's amount doesn't carry over
  };

  const quick = (pct: number) => {
    if (!active) return;
    setAmount(fromAmount(BigInt(Math.floor(Number(active.value) * pct))));
  };

  const onConfirm = async () => {
    if (inFlight.current || !address || !active || busy) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const currency: Currency = active.currency;
      const enteredAmount = toAmount(amount);
      if (enteredAmount <= 0n) return;
      const isMax = enteredAmount >= active.value;
      // The seam's `withdraw` burns SHARES, but the UI is asset-denominated. Convert via the
      // current NAV: shares = amount * SCALE / sharePrice. For "Max" use the full share balance
      // directly (balanceOf) rather than converting the displayed asset value back to shares, to
      // avoid leaving rounding dust behind in the bucket.
      const shares = isMax
        ? await client.balanceOf(address, currency)
        : (enteredAmount * SHARE_PRICE_SCALE) / (await client.sharePrice(currency));
      if (shares <= 0n) return;
      await client.withdraw(address, currency, shares).signAndSubmit(depositorSigner(address, signTransaction));
      setToast("Sent to your wallet");
      router.push("/home");
    } catch (e) {
      const w = toWalletError(e);
      if (w.code !== USER_CLOSED_MODAL) setToast(w.message); // user closed modal → silent
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  };

  return (
    <div className="flex min-h-[calc(100dvh-52px)] flex-col">
      <SubHeader title="Move to wallet" />
      <div className="mb-1 text-center">
        <button
          aria-label="Choose bucket"
          onClick={chooseNextBucket}
          className="inline-flex h-10 items-center gap-2.5 rounded-full bg-[#ECECEC] pl-2.5 pr-4 text-[15px] font-semibold"
        >
          <span className="grid h-[22px] w-[22px] place-items-center rounded-full bg-white text-[9px] font-semibold">
            {active?.currency ?? "USD"}
          </span>
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
      <Keypad value={amount} onChange={setAmount} symbol={symbol} onQuick={quick} />
      <Button onClick={onConfirm}>Move to wallet</Button>
      <Toast open={!!toast} message={toast ?? ""} />
    </div>
  );
}
