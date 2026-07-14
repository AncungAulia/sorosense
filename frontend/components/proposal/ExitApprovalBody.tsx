"use client";
import { useEffect, useRef, useState } from "react";
import { Button, Card } from "../ui";
import { usePendingExit } from "../../hooks/usePendingExit";
import { useVault } from "../../hooks/useVault";
import { useWallet } from "../../hooks/useWallet";
import { depositorSigner } from "../../lib/vault/signer";
import { formatCurrency } from "../../lib/vault/units";
import { toWalletError, USER_CLOSED_MODAL } from "../../lib/wallet-error";

/**
 * The safe-exit approval state machine, lifted VERBATIM from ExitApproval so the mobile BottomSheet
 * and the desktop Dialog stay in lockstep. Returns the live proposal view + handlers; the local
 * `toast` is rendered by each wrapper OUTSIDE its sheet/dialog (so it survives the close).
 */
export function useExitApproval(onClose: () => void) {
  const pend = usePendingExit();
  const { client, bump } = useVault();
  const { address, signTransaction } = useWallet();
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

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
      await client.approveExit(address, pend.proposal.id).signAndSubmit(depositorSigner(address, signTransaction));
      bump();
      setToast("Exit approved. Moving your funds now.");
      onClose();
    } catch (e) {
      const w = toWalletError(e);
      if (w.code !== USER_CLOSED_MODAL) setToast(w.message);
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  };

  const onDecline = () => {
    setToast("Kept paused. Nothing moved."); // no seam call: funds never move without approval
    onClose();
  };

  return { pend, busy, toast, onApprove, onDecline };
}

/**
 * The From/To card + copy + approve/decline buttons. `variant` picks ONLY the button block:
 * "sheet" reproduces the mobile stacked buttons verbatim (unchanged DOM); "dialog" is side-by-side.
 */
export function ExitApprovalBody({
  pend,
  busy,
  variant,
  onApprove,
  onDecline,
}: {
  pend: ReturnType<typeof usePendingExit>;
  busy: boolean;
  variant: "sheet" | "dialog";
  onApprove: () => void;
  onDecline: () => void;
}) {
  return (
    <>
      <h1 className="mb-1.5 text-xl font-semibold">Approve safe exit</h1>
      {pend?.proposal ? (
        <>
          <p className="mb-[18px] text-sm text-muted">
            We paused your {pend.sym} pool after we detected unusual activity in the pool. Approve
            moving your funds to another {pend.sym} pool.
          </p>
          <Card className="bg-white p-3.5">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-warn-soft text-warn">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round"><path d="M9 5v14M15 5v14" /></svg>
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
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#e8f5ee] text-pos">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round"><path d="M23 6 13.5 16.5 8.5 11.5 1 19" /><path d="M17 6h6v6" /></svg>
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[11.5px] text-muted">To</div>
                <div className="font-semibold">{pend.toMeta?.name ?? "Safe pool"}</div>
              </div>
              {pend.toMeta && <div className="font-semibold text-pos">{pend.toMeta.apy.toFixed(2)}% APY</div>}
            </div>
          </Card>
          {variant === "sheet" ? (
            <>
              <Button className="mt-[18px]" onClick={onApprove} disabled={busy}>Approve and sign in wallet</Button>
              <Button variant="glass" className="mt-2.5" onClick={onDecline} disabled={busy}>Keep it paused</Button>
            </>
          ) : (
            <div className="mt-[18px] flex gap-2.5">
              <Button variant="glass" className="flex-1" onClick={onDecline} disabled={busy}>Keep paused</Button>
              <Button className="flex-1" onClick={onApprove} disabled={busy}>Approve</Button>
            </div>
          )}
        </>
      ) : (
        <p className="mb-2 text-sm text-muted">Preparing your safe exit.</p>
      )}
    </>
  );
}
