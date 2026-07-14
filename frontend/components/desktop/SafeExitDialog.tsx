"use client";
import { Dialog } from "../ui/Dialog";
import { Toast } from "../ui";
import { useExitApproval, ExitApprovalBody } from "../proposal/ExitApprovalBody";

/** Desktop safe-exit approval — the same body/logic as mobile ExitApproval, in a centered Dialog with
 *  side-by-side buttons. Toast lives outside the Dialog so it survives the approve-close. */
export function SafeExitDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { pend, busy, toast, onApprove, onDecline } = useExitApproval(onClose);
  return (
    <>
      <Dialog open={open} onClose={onClose} label="Approve safe exit">
        <ExitApprovalBody pend={pend} busy={busy} variant="dialog" onApprove={onApprove} onDecline={onDecline} />
      </Dialog>
      <Toast open={!!toast} message={toast ?? ""} />
    </>
  );
}
