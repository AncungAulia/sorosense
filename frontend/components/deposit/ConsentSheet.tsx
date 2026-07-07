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
    <BottomSheet open={open} onClose={onClose} label="Approve automatic earning">
      <h1 className="mb-1.5 text-xl font-semibold">Approve once, earn automatically</h1>
      <p className="mb-[18px] text-sm text-muted">
        Sign one time to let the agent put your money in the safest pools and reinvest what it earns,
        without asking you every time. Your money stays yours, and only you can move it out.
      </p>
      <Button onClick={onAgree}>Agree &amp; sign</Button>
    </BottomSheet>
  );
}
