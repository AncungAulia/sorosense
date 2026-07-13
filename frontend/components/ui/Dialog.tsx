"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Centered modal for a single focused decision (the safe-exit approval, and the deposit consent step
 * reused inside the add-funds drawer). Portaled to body, z-[70] (above every drawer). Centering is a
 * grid, never a transform (U14). Backdrop is a pointer-events-none overlay; clicks on the empty grid
 * area hit the wrapper itself, so `target === currentTarget` closes only on a true outside click.
 */
export function Dialog({
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
    <div
      data-testid="dialog-wrap"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className={`fixed inset-0 z-[70] grid place-items-center p-5 transition-opacity duration-150 ${
        open ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[rgba(17,19,22,.32)] backdrop-blur-[2px]" />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        aria-hidden={!open}
        className="relative w-[min(480px,100%)] rounded-[22px] border border-white bg-card p-6 outline-none [box-shadow:0_-1px_0_rgba(0,0,0,.04),0_24px_60px_-26px_rgba(17,19,22,.28)]"
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
