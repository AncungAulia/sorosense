"use client";
import { createContext, useCallback, useEffect, useState, type ReactNode } from "react";
import { Toast } from "../components/ui";

type Ctx = { show: (message: string) => void };
export const ToastContext = createContext<Ctx | null>(null);

/** Mirrors ExitApproval's own dismiss (components/proposal/ExitApproval.tsx:31). */
export const TOAST_MS = 2500;

export function ToastProvider({ children }: { children: ReactNode }) {
  // An object, not a bare string: `show` must restart the dismiss timer even when the same
  // message fires twice, and a string write that is Object.is-equal makes React bail out of
  // the re-render — the effect below would never re-run. A fresh object is never equal.
  const [toast, setToast] = useState<{ message: string } | null>(null);

  const show = useCallback((message: string) => setToast({ message }), []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {/*
        `Toast` is `absolute`, and every caller before this provider sat inside a `relative`
        screen wrapper ((app)/layout.tsx, (flow)/layout.tsx, app/page.tsx). At the root <body>
        there is none, so the toast would anchor to the document and drift on scrollable screens.
        Restore the viewport anchor here rather than restyling the shared primitive.
      */}
      <div className="pointer-events-none fixed inset-0 z-[70]">
        <Toast open={!!toast} message={toast?.message ?? ""} />
      </div>
    </ToastContext.Provider>
  );
}
