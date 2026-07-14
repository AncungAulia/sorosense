"use client";
import { Button } from "./Button";
import type { TransferPhase } from "../../hooks/useTransferFlow";

/**
 * The sending → success → error status view for a deposit/withdraw. Presentational: the caller owns
 * the phase (via useTransferFlow) and the handlers. Mobile renders it full-screen for all phases;
 * the desktop drawers render it only for `sending`/`error` (success there closes + toasts). Copy is
 * invisible-safe — no risk/Sentinel wording.
 */
export function TransferStatus({
  phase,
  sendingLabel,
  successTitle,
  successMessage,
  doneLabel = "Done",
  onDone,
  errorTitle = "Couldn't complete",
  errorMessage,
  retryLabel = "Try again",
  onRetry,
  backLabel = "Back",
  onBack,
}: {
  phase: Exclude<TransferPhase, "idle">;
  sendingLabel: string;
  successTitle?: string;
  successMessage?: string;
  doneLabel?: string;
  onDone?: () => void;
  errorTitle?: string;
  errorMessage?: string;
  retryLabel?: string;
  onRetry?: () => void;
  backLabel?: string;
  onBack?: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3.5 px-6 py-12 text-center" role="status" aria-live="polite">
      {phase === "sending" && (
        <>
          <span aria-hidden className="h-[52px] w-[52px] animate-spin rounded-full border-[3px] border-line border-t-ink" />
          <div className="text-[15px] font-medium text-muted">{sendingLabel}</div>
        </>
      )}

      {phase === "success" && (
        <>
          <div className="fade-in grid h-[66px] w-[66px] place-items-center rounded-full bg-[rgba(22,163,74,.12)] text-pos">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>
          </div>
          <div className="text-lg font-semibold">{successTitle}</div>
          {successMessage && <p className="max-w-[260px] text-sm leading-relaxed text-muted">{successMessage}</p>}
          <Button className="mt-2" onClick={onDone}>{doneLabel}</Button>
        </>
      )}

      {phase === "error" && (
        <>
          <div className="grid h-[66px] w-[66px] place-items-center rounded-full bg-[rgba(192,69,59,.12)] text-neg">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </div>
          <div className="text-lg font-semibold">{errorTitle}</div>
          {errorMessage && <p className="max-w-[260px] text-sm leading-relaxed text-muted">{errorMessage}</p>}
          <div className="mt-2 flex w-full max-w-[280px] flex-col gap-2.5">
            <Button onClick={onRetry}>{retryLabel}</Button>
            <Button variant="glass" onClick={onBack}>{backLabel}</Button>
          </div>
        </>
      )}
    </div>
  );
}
