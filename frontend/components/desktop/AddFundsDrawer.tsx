"use client";
import { useRef, useState } from "react";
import type { Currency } from "@sorosense/vault-client";
import { Drawer } from "../ui/Drawer";
import { Dialog } from "../ui/Dialog";
import { Button, CoinBadge } from "../ui";
import { STABLECOINS, stablecoinBySym, getWalletBalance, type StablecoinSym } from "../../lib/vault/data";
import { sanitizeAmount } from "../../lib/vault/sanitize";
import { toAmount, fromAmount, formatCurrency } from "../../lib/vault/units";
import { useVault } from "../../hooks/useVault";
import { useWallet } from "../../hooks/useWallet";
import { useToast } from "../../hooks/useToast";
import { depositorSigner } from "../../lib/vault/signer";
import { recordDeposit } from "../../lib/vault/contributions";
import { toWalletError, USER_CLOSED_MODAL } from "../../lib/wallet-error";

/**
 * Desktop add-funds drawer: mirrors the mobile AddFunds + DepositKeypad flow (interface-map §1–2,
 * §12) merged into two in-drawer steps (pick stablecoin → amount), an <input> instead of the numpad,
 * and an in-drawer done step. The deposit submit is DUPLICATED from DepositKeypad on purpose — the
 * mobile keypad stays byte-identical. Consent reuses the ConsentSheet COPY inside the Dialog (z-[70],
 * above the drawer) rather than the BottomSheet wrapper.
 */
export function AddFundsDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { client, bump } = useVault();
  const { address, signTransaction } = useWallet();
  const { show } = useToast();
  const [sym, setSym] = useState<StablecoinSym | null>(null);
  const [amount, setAmount] = useState("0");
  const [consentOpen, setConsentOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const inFlight = useRef(false);

  const coin = sym ? stablecoinBySym(sym) : undefined;
  const currency: Currency = coin?.currency ?? "USD";
  const cur = currency === "EUR" ? "€" : "$";
  const available = sym ? getWalletBalance(sym) : 0n;
  const entered = toAmount(amount);
  const exceeded = entered > available;

  const reset = () => {
    setSym(null);
    setAmount("0");
    setDone(false);
    setConsentOpen(false);
  };
  const close = () => {
    onClose();
    reset();
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

  const runDeposit = async () => {
    if (!address) return;
    const deposited = toAmount(amount);
    await client.deposit(address, currency, deposited).signAndSubmit(depositorSigner(address, signTransaction));
    recordDeposit(currency, deposited); // cost-basis for "Total earned"
    show("Deposited. Agent is allocating.");
    bump(); // Overview refetches buckets
    setDone(true);
  };

  const onConfirm = async () => {
    if (inFlight.current || !address || busy || entered <= 0n || exceeded) return;
    inFlight.current = true;
    setBusy(true);
    try {
      if (!(await client.hasConsent(address))) {
        setConsentOpen(true);
        return;
      }
      await runDeposit();
    } catch (e) {
      const w = toWalletError(e);
      if (w.code !== USER_CLOSED_MODAL) show(w.message);
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  };

  const onAgree = async () => {
    if (inFlight.current || !address) return;
    inFlight.current = true;
    setConsentOpen(false);
    setBusy(true);
    try {
      await client.setPolicyConsent(address).signAndSubmit(depositorSigner(address, signTransaction));
      await runDeposit();
    } catch (e) {
      const w = toWalletError(e);
      if (w.code !== USER_CLOSED_MODAL) show(w.message);
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  };

  const title = done ? "Done" : sym ? `Deposit ${sym}` : "Add funds";

  return (
    <Drawer open={open} onClose={close} label="Add funds">
      <div className="flex items-center justify-between border-b border-line px-[22px] pb-3.5 pt-5">
        <div className="flex items-center gap-2.5">
          {sym && !done && (
            <button aria-label="Back to assets" onClick={back} className="grid h-8 w-8 place-items-center rounded-full text-ink-2 hover:bg-pill">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
            </button>
          )}
          <span className="text-[17px] font-semibold">{title}</span>
        </div>
        <button aria-label="Close" onClick={close} className="grid h-[34px] w-[34px] place-items-center rounded-full bg-pill text-ink-2">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </div>

      {done ? (
        <div className="flex flex-1 flex-col items-center gap-3.5 px-[22px] py-11 text-center">
          <div className="grid h-[66px] w-[66px] place-items-center rounded-full bg-[rgba(22,163,74,.12)] text-pos">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>
          </div>
          <div className="text-lg font-semibold">Deposit sent</div>
          <p className="max-w-[250px] text-sm leading-relaxed text-muted">Your {currency} bucket is now earning. Move to your wallet anytime.</p>
          <Button className="mt-2" onClick={close}>Done</Button>
        </div>
      ) : !sym ? (
        <div className="flex-1 overflow-auto px-[22px] py-5">
          <p className="mb-2 text-[12.5px] font-medium text-muted">Stablecoins</p>
          {STABLECOINS.map((s, i) => (
            <button
              key={s.sym}
              onClick={() => pick(s.sym)}
              className={`flex w-full items-center gap-[13px] py-3.5 text-left ${i === 0 ? "" : "border-t border-line"}`}
            >
              <CoinBadge token={s.sym} size={40} />
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{s.sym}</div>
                <div className="mt-[5px] flex flex-wrap gap-1.5">
                  {s.chains.map((c) => (
                    <span key={c} className="inline-flex h-[22px] items-center rounded-full bg-pill px-[9px] text-[11.5px] font-medium text-muted">{c}</span>
                  ))}
                </div>
              </div>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="text-faint"><path d="M9 6l6 6-6 6" /></svg>
            </button>
          ))}
        </div>
      ) : (
        <div className="flex flex-1 flex-col overflow-auto px-[22px] py-5">
          {/* wallet balance line (getWalletBalance fixture; real trustline read = STE-52). */}
          <div className="mb-4 flex items-center gap-3 rounded-2xl bg-pill px-3.5 py-3">
            <CoinBadge token={sym} size={30} />
            <div className="text-[15px] font-semibold [font-variant-numeric:tabular-nums]">{formatCurrency(available, currency)} {sym}</div>
          </div>
          {/* STE-52 (reserved, NOT implemented): in integration mode with a zero trustline balance,
              this line is replaced by an env-gated "Get test funds" button (disabled on mainnet). */}
          <p className="mb-2 text-[12.5px] font-medium text-muted">Amount</p>
          <div className="flex items-center gap-1.5 rounded-2xl border border-line-2 bg-white px-4 py-3.5 [box-shadow:0_1px_2px_rgba(17,19,22,.04),0_8px_18px_-10px_rgba(17,19,22,.18)]">
            <span className="text-[26px] font-semibold text-[#3f4448]">{cur}</span>
            <input
              inputMode="decimal"
              aria-label="Amount"
              value={amount}
              onChange={(e) => setAmount(sanitizeAmount(e.target.value))}
              className="w-full min-w-0 flex-1 border-none bg-transparent text-[30px] font-semibold tracking-[-.02em] text-ink outline-none [font-variant-numeric:tabular-nums]"
            />
          </div>
          <div className="mt-3 flex gap-2.5">
            <button onClick={() => quick(0.1)} className="h-[46px] flex-1 rounded-[14px] bg-pill text-sm font-semibold text-ink">10%</button>
            <button onClick={() => quick(0.5)} className="h-[46px] flex-1 rounded-[14px] bg-pill text-sm font-semibold text-ink">50%</button>
            <button onClick={() => quick(1)} className="h-[46px] flex-1 rounded-[14px] bg-pill text-sm font-semibold text-ink">Max</button>
          </div>
          {exceeded && <p className="mt-2.5 text-center text-[12.5px] text-neg">Not enough balance</p>}
          <div className="mt-auto pt-6">
            <Button onClick={onConfirm} disabled={busy || exceeded || entered <= 0n}>Deposit</Button>
          </div>
        </div>
      )}

      {/* Consent in a Dialog — reuse the ConsentSheet COPY (interface-map §4), not its BottomSheet. */}
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
