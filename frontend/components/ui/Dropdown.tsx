"use client";
import { useEffect, useRef, type ReactNode } from "react";

/**
 * Small anchored menu for the desktop account avatar. Inline (not portaled) — it is tiny and lives
 * inside the topbar's `relative` wrapper. Outside-click checks the menu's PARENT (the caller's
 * `.relative` wrapper that also holds the trigger), mirroring the mockup's `!closest('.acctwrap')`
 * so clicking the avatar toggles rather than double-fires. z-40: below the topbar, as in the mockup.
 */
export function Dropdown({
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
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const wrap = ref.current?.parentElement;
      if (wrap && !wrap.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={label}
      aria-hidden={!open}
      className={`absolute right-0 top-[calc(100%+10px)] z-40 w-[300px] rounded-[18px] border border-white bg-card p-1.5 [box-shadow:0_-1px_0_rgba(0,0,0,.04),0_24px_60px_-26px_rgba(17,19,22,.28)] transition-[opacity,transform] duration-150 ${
        open ? "opacity-100" : "pointer-events-none -translate-y-1.5 opacity-0"
      }`}
    >
      {children}
    </div>
  );
}
