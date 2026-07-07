"use client";
import { Button, BottomSheet } from "../ui";

export function ConsentSheet({
  open,
  onAgree,
  onClose,
}: {
  open: boolean;
  onAgree: () => void;
  onClose: () => void;
}) {
  return (
    <BottomSheet open={open} onClose={onClose} label="Authorize the safety mandate">
      <h1 className="mb-1.5 text-xl font-semibold">Authorize once, earn hands-free</h1>
      <p className="mb-[18px] text-sm text-muted">
        Sign a one-time safety mandate. It lets the agent allocate, auto-compound, and rebalance your
        funds within the safest vetted pools in this currency — no per-move approval. Your funds never
        leave the non-custodial vault, and only you can withdraw.
      </p>
      <Button onClick={onAgree}>Agree &amp; sign</Button>
      <Button variant="glass" className="mt-2.5" onClick={onClose}>
        Not now
      </Button>
    </BottomSheet>
  );
}
