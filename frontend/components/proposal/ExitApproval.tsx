"use client";
import { useEffect, useRef, useState } from "react";
import { Button, BottomSheet, Toast } from "../ui";
import { usePendingExit } from "../../hooks/usePendingExit";
import { useVault } from "../../hooks/useVault";
import { useWallet } from "../../hooks/useWallet";
import { depositorSigner } from "../../lib/vault/signer";
import { formatCurrency } from "../../lib/vault/units";
import { toWalletError, USER_CLOSED_MODAL } from "../../lib/wallet-error";

/**
 * The only approval surface for a Sentinel-freeze exit. Reads the frozen bucket + its proposal via
 * usePendingExit and drives the state machine:
 *   frozen-not-yet-proposed → interstitial · proposed → approve/decline · signing → busy ·
 *   confirmed → bump + toast + close · failed → toast (user-closed-modal is silent).
 * Decline moves nothing (funds are never moved without approval). Copy is invisible-safety: no
 * "Sentinel"/"risk" wording. Withdraw signing reuses the same depositorSigner + signAndSubmit path.
 */
export function ExitApproval({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pend = usePendingExit();
  const { client, bump } = useVault();
  const { address, signTransaction } = useWallet();
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  // ExitApproval stays mounted at page level (unlike WithdrawKeypad, which unmounts on
  // navigation), so the toast needs its own auto-dismiss or it lingers over the page forever.
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(timer);
  }, [toast]);

  const onApprove = async () => {
    if (inFlight.current || !address || !pend?.proposal || busy) return;
    inFlight.current = true;
    setBusy(true);
    try {
      await client
        .approveExit(address, pend.proposal.id)
        .signAndSubmit(depositorSigner(address, signTransaction));
      bump(); // re-read: banner clears, bucket un-freezes
      setToast("Exit approved. Moving to a safe pool.");
      onClose();
    } catch (e) {
      const w = toWalletError(e);
      if (w.code !== USER_CLOSED_MODAL) setToast(w.message); // user closed modal → silent
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  };

  const onDecline = () => {
    setToast("Kept paused — your funds stay safe."); // no seam call: funds never move without approval
    onClose();
  };

  return (
    <>
    <BottomSheet open={open} onClose={onClose} label="Approve safe exit">
      <h1 className="mb-1.5 text-xl font-semibold">Approve safe exit</h1>
      {pend?.proposal ? (
        <>
          <p className="mb-[18px] text-sm text-muted">
            We paused your {pend.sym} pool to keep it safe. Your
            funds are protected — approve moving them to a safe pool in the same currency.
          </p>
          <div className="rounded-[18px] border border-line bg-white p-3.5">
            <div className="flex items-center gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-warn-soft text-warn">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M9 5v14M15 5v14" /></svg>
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[11.5px] text-muted">From</div>
                <div className="font-semibold">{pend.fromLabel}</div>
              </div>
              <div className="font-semibold">{formatCurrency(pend.amount, pend.currency)}</div>
            </div>
            <div className="my-1 grid place-items-center text-faint">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M6 13l6 6 6-6" /></svg>
            </div>
            <div className="flex items-center gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#e8f5ee] text-pos">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[11.5px] text-muted">To</div>
                <div className="font-semibold">{pend.toMeta?.name ?? "Safe pool"}</div>
              </div>
              {pend.toMeta && <div className="font-semibold text-pos">{pend.toMeta.apy.toFixed(2)}% APY</div>}
            </div>
          </div>
          <Button className="mt-[18px]" onClick={onApprove} disabled={busy}>Approve and sign in wallet</Button>
          <Button variant="glass" className="mt-2.5" onClick={onDecline} disabled={busy}>Keep it paused</Button>
          <p className="mt-3 text-center text-xs text-muted">Your funds stay safe either way. Nothing moves until you approve.</p>
        </>
      ) : (
        <p className="mb-2 text-sm text-muted">Preparing a safe exit… Your funds are protected in the meantime.</p>
      )}
    </BottomSheet>
    {/* Toast lives outside the sheet so it stays visible after approve closes the sheet. */}
    <Toast open={!!toast} message={toast ?? ""} />
    </>
  );
}
