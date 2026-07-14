"use client";
import { BottomSheet, Toast } from "../ui";
import { useExitApproval, ExitApprovalBody } from "./ExitApprovalBody";

/**
 * The only mobile approval surface for a Sentinel-freeze exit. Now a thin wrapper: the BottomSheet +
 * the same fragment (Toast outside the sheet so it survives the approve-close), body + logic via the
 * shared ExitApprovalBody. React fragments emit no DOM, so the rendered tree is unchanged (proven by
 * the existing ExitApproval + home tests).
 */
export function ExitApproval({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { pend, busy, toast, onApprove, onDecline } = useExitApproval(onClose);
  return (
    <>
      <BottomSheet open={open} onClose={onClose} label="Approve safe exit">
        <ExitApprovalBody pend={pend} busy={busy} variant="sheet" onApprove={onApprove} onDecline={onDecline} />
      </BottomSheet>
      <Toast open={!!toast} message={toast ?? ""} />
    </>
  );
}
