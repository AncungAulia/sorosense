"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Right-edge desktop drawer. Portaled to document.body so a transformed ancestor (.page-enter) never
 * becomes its containing block (U14). Follows BottomSheet's discipline — role="dialog" stays mounted,
 * visibility toggles via translate + aria-hidden — but adds Escape, body scroll-lock, and focus-in
 * (which BottomSheet deliberately omits on mobile). z-[55]/z-[56]: above the topbar (z-50), below the
 * Dialog (z-[70]).
 */
export function Drawer({
  open,
  onClose,
  label,
  children,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  children: ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  // Mount flag gates createPortal to client-only (SSR has no document.body). Runs once — the
  // set-state-in-effect this rule warns about is intentional here (same pattern as useEarnings).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (open && mounted) {
      panelRef.current?.focus();
    }
  }, [open, mounted]);

  if (!mounted) return null;

  return createPortal(
    <>
      <div
        data-testid="drawer-scrim"
        onClick={onClose}
        className={`fixed inset-0 z-[55] bg-[rgba(17,19,22,.28)] backdrop-blur-[2px] transition-opacity duration-200 ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        aria-hidden={!open}
        className={`fixed inset-y-0 right-0 z-[56] flex h-dvh w-[min(420px,100vw)] flex-col border-l border-white bg-card outline-none [box-shadow:0_-1px_0_rgba(0,0,0,.04),0_24px_60px_-26px_rgba(17,19,22,.28)] transition-transform duration-200 ${
          open ? "translate-x-0" : "pointer-events-none translate-x-full"
        }`}
      >
        {children}
      </div>
    </>,
    document.body,
  );
}
