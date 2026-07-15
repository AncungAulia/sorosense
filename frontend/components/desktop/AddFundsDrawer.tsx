"use client";
import { useState } from "react";
import type { Currency, TxResult } from "@sorosense/vault-client";
import { Drawer } from "../ui/Drawer";
import { Dialog } from "../ui/Dialog";
import { Button, CoinBadge, CountUp, Skeleton, TransferStatus } from "../ui";
import { FundingAssetRow } from "../deposit/FundingAssetRow";
import { type StablecoinSym } from "../../lib/vault/data";
import { sanitizeAmount } from "../../lib/vault/sanitize";
import { toAmount, fromAmount, formatCurrency, UNIT } from "../../lib/vault/units";
import { useFunding } from "../../hooks/useFunding";
import { useVault } from "../../hooks/useVault";
import { useWallet } from "../../hooks/useWallet";
import { useWalletBalance } from "../../hooks/useWalletBalance";
import { useTransferFlow } from "../../hooks/useTransferFlow";
import { depositorSigner } from "../../lib/vault/signer";
import { recordDeposit } from "../../lib/vault/contributions";

/**
 * Desktop deposit drawer: mirrors the mobile Deposit + DepositKeypad flow merged into two in-drawer
 * steps (pick stablecoin → amount), an <input> instead of the numpad. The deposit submit is duplicated
 * from DepositKeypad on purpose — the mobile keypad stays byte-identical. Consent reuses the
 * ConsentSheet COPY inside the Dialog (z-[70], above the drawer). The submit runs through
 * useTransferFlow: `sending`/`success`/`error` show inline (TransferStatus), matching mobile.
 */
export function AddFundsDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { client, bump } = useVault();
  const { address, signTransaction } = useWallet();
  // `GET /funding` when the backend is configured, the local fixture otherwise (R7).
  const { options } = useFunding();
  const [sym, setSym] = useState<StablecoinSym | null>(null);
  const [amount, setAmount] = useState("0");
  const [consentOpen, setConsentOpen] = useState(false);
  const [busy, setBusy] = useState(false); // guards the async consent check before the flow starts
  const flow = useTransferFlow();

  // The picked coin's currency comes from the same list the user picked it out of, so a backend that
  // funds a bucket from a different asset needs no second mapping table here.
  const coin = sym ? options.stablecoins.find((s) => s.sym === sym) : undefined;
  const currency: Currency = coin?.currency ?? "USD";
  const cur = currency === "EUR" ? "€" : "$";
  // Real trustline balance when Horizon + the issuer are configured; the fixture otherwise (R6).
  const balance = useWalletBalance(sym);
  const available = sym ? balance.available : 0n;
  const entered = toAmount(amount);
  const exceeded = entered > available;
  const statusPhase = flow.phase === "idle" ? null : flow.phase;
  const showStatus = statusPhase !== null;

  const reset = () => {
    setSym(null);
    setAmount("0");
    setConsentOpen(false);
  };
  const close = () => {
    onClose();
    reset();
    flow.reset();
  };

  const pick = (s: StablecoinSym) => {
    setSym(s);
    setAmount("0");
  };
  const back = () => {
    setSym(null);
    setAmount("0");
  };
  const quick = (pct: number) => setAmount(fromAmount(BigInt(Math.floor(Number(available) * pct))));

  const doDeposit = async (): Promise<TxResult | undefined> => {
    if (!address) return;
    const deposited = toAmount(amount);
    const result = await client.deposit(address, currency, deposited).signAndSubmit(depositorSigner(address, signTransaction));
    // Only a confirmed deposit updates local accounting and refreshes the dashboard.
    if (result.success) {
      recordDeposit(currency, deposited); // cost-basis for "Total earned"
      bump();
    }
    return result;
  };

  const onConfirm = async () => {
    if (busy || showStatus || !address || entered <= 0n || exceeded) return;
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
      // A failed mandate stops the chain here — the deposit that follows would panic (NoConsent).
      if (!consent.success) return consent;
      return doDeposit();
    });
  };

  const title = statusPhase && statusPhase !== "sending" ? "Deposit Status" : sym ? `Deposit ${sym}` : "Deposit";

  return (
    <Drawer open={open} onClose={close} label="Deposit">
      <div className="flex items-center justify-between border-b border-line px-[22px] pb-3.5 pt-5">
        <div className="flex items-center gap-2.5">
          {sym && !showStatus && (
            <button aria-label="Back to assets" onClick={back} className="grid h-8 w-8 place-items-center rounded-full text-ink-2 transition-colors hover:bg-pill">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
            </button>
          )}
          <span className="text-[17px] font-semibold">{title}</span>
        </div>
        <button aria-label="Close" onClick={close} className="grid h-[34px] w-[34px] place-items-center rounded-full bg-pill text-ink-2 transition-colors hover:bg-line-2">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </div>

      {statusPhase ? (
        <TransferStatus
          phase={statusPhase}
          sendingLabel="Sending deposit"
          successTitle="Deposit Success"
          successMessage="Your fund is now earning"
          doneLabel="Back to Home"
          onDone={close}
          errorTitle="Deposit Failed"
          errorMessage="Your deposit was not sent. No funds moved from your wallet."
          backLabel="Back to Deposit"
          onBack={flow.reset}
        />
      ) : !sym ? (
        <div className="flex-1 overflow-auto px-[22px] py-5">
          <p className="mb-2 text-[12.5px] font-medium text-muted">Stablecoins</p>
          {options.stablecoins.map((s, i) => (
            <FundingAssetRow
              key={s.sym}
              asset={s}
              divider={i !== 0}
              onPick={pick}
              className="-mx-[22px] w-[calc(100%+44px)] px-[22px]"
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-1 flex-col overflow-auto px-[22px] py-5">
          {/* Wallet balance line — the real Horizon trustline read when configured, the fixture otherwise. */}
          <div className="mb-4 flex items-center gap-3 rounded-2xl bg-pill px-3.5 py-3">
            <CoinBadge token={sym} size={30} />
            <div className="text-[15px] font-semibold [font-variant-numeric:tabular-nums]">
              {balance.loading ? (
                <Skeleton className="h-4 w-28 rounded-md" />
              ) : (
                <>
                  <CountUp
                    animateOnMount
                    value={Number(available) / Number(UNIT)}
                    format={(n) => `${formatCurrency(BigInt(Math.round(n * Number(UNIT))), currency)}`}
                  />{" "}
                  {sym}
                </>
              )}
            </div>
          </div>
          <p className="mb-2 text-[12.5px] font-medium text-muted">Amount</p>
          <div className="flex items-center gap-1.5 rounded-2xl border border-line-2 bg-white px-4 py-3.5 [box-shadow:0_1px_2px_rgba(17,19,22,.04),0_8px_18px_-10px_rgba(17,19,22,.18)]">
            <span className="text-[26px] font-semibold text-[#3f4448]">{cur}</span>
            <input
              data-amount-input
              inputMode="decimal"
              aria-label="Amount"
              value={amount}
              onChange={(e) => setAmount(sanitizeAmount(e.target.value))}
              className="w-full min-w-0 flex-1 appearance-none border-none bg-transparent text-[30px] font-semibold tracking-[-.02em] text-ink shadow-none outline-none ring-0 [font-variant-numeric:tabular-nums] focus:shadow-none focus:outline-none focus:ring-0 focus-visible:shadow-none focus-visible:outline-none focus-visible:outline-offset-0 focus-visible:ring-0"
            />
          </div>
          <div className="mt-3 flex gap-2.5">
            <button onClick={() => quick(0.1)} className="h-[46px] flex-1 rounded-[14px] bg-pill text-sm font-semibold text-ink transition-colors hover:bg-line-2">10%</button>
            <button onClick={() => quick(0.5)} className="h-[46px] flex-1 rounded-[14px] bg-pill text-sm font-semibold text-ink transition-colors hover:bg-line-2">50%</button>
            <button onClick={() => quick(1)} className="h-[46px] flex-1 rounded-[14px] bg-pill text-sm font-semibold text-ink transition-colors hover:bg-line-2">Max</button>
          </div>
          {exceeded && <p className="mt-2.5 text-center text-[12.5px] text-neg">Not enough balance</p>}
          <div className="mt-auto pt-6">
            <Button onClick={onConfirm} disabled={busy || exceeded || entered <= 0n}>Deposit</Button>
          </div>
        </div>
      )}

      {/* Consent in a Dialog — reuse the ConsentSheet COPY, not its BottomSheet. */}
      <Dialog open={consentOpen} onClose={() => setConsentOpen(false)} label="Approve automatic earning">
        <h1 className="mb-1.5 text-xl font-semibold">Approve once, earn automatically</h1>
        <p className="mb-[18px] text-sm text-muted">
          Sign one time to let the agent put your money in the safest pools and reinvest what it earns,
          without asking you every time. Your money stays yours, and only you can move it out.
        </p>
        <Button onClick={onAgree}>Agree &amp; sign</Button>
      </Dialog>
    </Drawer>
  );
}
