"use client";
import { BottomSheet, Button } from "../ui";

/** Log out is destructive enough to confirm: it clears the session and drops back to the landing. */
export function LogoutSheet({
  open,
  onClose,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <BottomSheet open={open} onClose={onClose} label="Log out">
      <h2 className="mb-1 text-xl font-semibold">Log out?</h2>
      <p className="mb-5 text-sm text-muted">
        Your funds stay in the vault. Reconnect your wallet any time to see them again.
      </p>
      <Button onClick={onConfirm}>Yes, log out</Button>
      <button onClick={onClose} className="mt-3 h-12 w-full text-[15px] font-semibold text-muted">
        Cancel
      </button>
    </BottomSheet>
  );
}
