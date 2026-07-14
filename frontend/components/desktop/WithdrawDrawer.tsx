"use client";
import { useEffect, useState } from "react";
import { SHARE_PRICE_SCALE, type Currency, type TxResult } from "@sorosense/vault-client";
import { Drawer } from "../ui/Drawer";
import { Button, CoinBadge, TransferStatus } from "../ui";
import { useBuckets } from "../../hooks/useBuckets";
import { useVault } from "../../hooks/useVault";
import { useWallet } from "../../hooks/useWallet";
import { useToast } from "../../hooks/useToast";
import { useTransferFlow } from "../../hooks/useTransferFlow";
import { sanitizeAmount } from "../../lib/vault/sanitize";
import { toAmount, fromAmount, formatCurrency } from "../../lib/vault/units";
import { depositorSigner } from "../../lib/vault/signer";
import { recordWithdraw } from "../../lib/vault/contributions";

/**
 * Desktop move-to-wallet drawer: mirrors WithdrawKeypad with an <input> instead of the numpad. The
 * withdraw submit is duplicated from WithdrawKeypad on purpose (mobile stays byte-identical): "Max"
 * burns the full share balance via balanceOf (no dust), else shares = entered * SCALE / sharePrice.
 * The submit runs through useTransferFlow: `sending`/`error` show inline (TransferStatus); `success`
 * closes + toasts (the dashboard behind reflects the reduced balance).
 */
export function WithdrawDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { buckets } = useBuckets();
  const { client, bump } = useVault();
  const { address, signTransaction } = useWallet();
  const { show } = useToast();
  const [i, setI] = useState(0);
  const [amount, setAmount] = useState("0");
  const [maxSelected, setMaxSelected] = useState(false);
  const flow = useTransferFlow();

  const active = buckets[i] ?? buckets[0];
  const cur = active?.currency === "EUR" ? "€" : "$";
  const multi = buckets.length >= 2;
  const entered = toAmount(amount);
  const available = active?.value ?? 0n;
  const exceeded = !!active && entered > available;
  const showStatus = flow.phase !== "idle";

  const close = () => {
    onClose();
    setI(0);
    setAmount("0");
    setMaxSelected(false);
  };

  // Desktop success = close + toast (the dashboard behind shows the reduced balance).
  useEffect(() => {
    if (flow.phase !== "success") return;
    show("Withdrawal submitted.");
    bump();
    // Closing the drawer + resetting the flow is the intended reaction to reaching success, not a
    // stray render cascade.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    close();
    flow.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow.phase]);

  const cycle = () => {
    if (!multi) return;
    setI((n) => (n + 1) % buckets.length);
    setAmount("0");
    setMaxSelected(false);
  };
  const quick = (pct: number) => {
    if (!active) return;
    setMaxSelected(pct === 1);
    setAmount(fromAmount(BigInt(Math.floor(Number(active.value) * pct))));
  };

  const doWithdraw = async (): Promise<TxResult | undefined> => {
    if (!address || !active) return;
    const currency: Currency = active.currency;
    const enteredAmount = toAmount(amount);
    if (enteredAmount <= 0n) return;
    const isMax = maxSelected;
    const shares = isMax
      ? await client.balanceOf(address, currency)
      : (enteredAmount * SHARE_PRICE_SCALE) / (await client.sharePrice(currency));
    if (shares <= 0n) return;
    const result = await client.withdraw(address, currency, shares).signAndSubmit(depositorSigner(address, signTransaction));
    // Cost basis moves only for a burn the chain confirmed; a rejected one leaves the bucket intact,
    // the flow in `error`, and the "Withdrawal submitted" toast unfired (R5).
    if (result.success) recordWithdraw(currency, isMax ? active.value : enteredAmount);
    return result;
  };

  const onConfirm = () => {
    if (showStatus || !address || !active || exceeded || entered <= 0n) return;
    void flow.run(doWithdraw);
  };

  return (
    <Drawer open={open} onClose={close} label="Move to wallet">
      <div className="flex items-center justify-between border-b border-line px-[22px] pb-3.5 pt-5">
        <span className="text-[17px] font-semibold">Move to wallet</span>
        <button aria-label="Close" onClick={close} className="grid h-[34px] w-[34px] place-items-center rounded-full bg-pill text-ink-2 transition-colors hover:bg-line-2">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </div>

      {showStatus ? (
        <TransferStatus
          phase={flow.phase === "error" ? "error" : "sending"}
          sendingLabel="Sending to your wallet…"
          errorMessage={flow.error}
          onRetry={flow.retry}
          backLabel="Back"
          onBack={flow.reset}
        />
      ) : (
        <div className="flex flex-1 flex-col overflow-auto px-[22px] py-5">
          <div className="mb-2 flex justify-center">
            <button
              aria-label="Choose bucket"
              onClick={cycle}
              className="inline-flex h-10 items-center gap-2.5 rounded-full bg-[#ECECEC] pl-2.5 pr-4 text-[15px] font-semibold transition-colors hover:bg-line-2"
            >
              <CoinBadge currency={active?.currency ?? "USD"} size={22} />
              {active?.name ?? "USD bucket"}
              {multi && (
                <svg data-testid="bucket-chevron" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M8 9l4-4 4 4M8 15l4 4 4-4" /></svg>
              )}
            </button>
          </div>
          <p className="mb-3.5 text-center text-[12.5px] text-muted">
            {active ? `${formatCurrency(active.value, active.currency)} available` : "—"}
          </p>
          <p className="mb-2 text-[12.5px] font-medium text-muted">Amount</p>
          <div className="flex items-center gap-1.5 rounded-2xl border border-line-2 bg-white px-4 py-3.5 [box-shadow:0_1px_2px_rgba(17,19,22,.04),0_8px_18px_-10px_rgba(17,19,22,.18)]">
            <span className="text-[26px] font-semibold text-[#3f4448]">{cur}</span>
            <input
              inputMode="decimal"
              aria-label="Amount"
              value={amount}
              onChange={(e) => {
                setMaxSelected(false);
                setAmount(sanitizeAmount(e.target.value));
              }}
              className="w-full min-w-0 flex-1 border-none bg-transparent text-[30px] font-semibold tracking-[-.02em] text-ink outline-none [font-variant-numeric:tabular-nums]"
            />
          </div>
          <div className="mt-3 flex gap-2.5">
            <button onClick={() => quick(0.1)} className="h-[46px] flex-1 rounded-[14px] bg-pill text-sm font-semibold text-ink transition-colors hover:bg-line-2">10%</button>
            <button onClick={() => quick(0.5)} className="h-[46px] flex-1 rounded-[14px] bg-pill text-sm font-semibold text-ink transition-colors hover:bg-line-2">50%</button>
            <button onClick={() => quick(1)} className="h-[46px] flex-1 rounded-[14px] bg-pill text-sm font-semibold text-ink transition-colors hover:bg-line-2">Max</button>
          </div>
          {exceeded && <p className="mt-2.5 text-center text-[12.5px] text-neg">Not enough balance</p>}
          <div className="mt-auto pt-6">
            <Button onClick={onConfirm} disabled={exceeded || !active || entered <= 0n}>Move to wallet</Button>
          </div>
        </div>
      )}
    </Drawer>
  );
}
