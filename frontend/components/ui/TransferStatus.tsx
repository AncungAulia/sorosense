"use client";
import { Button } from "./Button";
import type { TransferPhase } from "../../hooks/useTransferFlow";

/**
 * Desktop drawer status view for deposit/withdraw: sending -> success | error.
 * Mobile flows keep their own full-page status screens.
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
    <div className="flex flex-1 flex-col items-center px-6 py-10 text-center" role="status" aria-live="polite">
      {phase === "sending" && (
        <div className="mt-20 flex flex-col items-center">
          <div className="relative grid h-[132px] w-[132px] place-items-center rounded-full bg-[rgba(17,19,22,.04)]">
            <div className="grid h-[102px] w-[102px] place-items-center rounded-full bg-[rgba(17,19,22,.055)]">
              <div className="grid h-[70px] w-[70px] place-items-center rounded-full bg-card [box-shadow:0_1px_2px_rgba(17,19,22,.04),0_18px_36px_-22px_rgba(17,19,22,.34)]">
                <svg
                  width="32"
                  height="32"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.1}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  className="animate-[send-plane_1.15s_ease-in-out_infinite] text-ink"
                >
                  <path d="M21 3 10 14" />
                  <path d="m21 3-7 18-4-7-7-4 18-7Z" />
                </svg>
              </div>
            </div>
          </div>
          <h2 className="mt-7 text-[21px] font-semibold leading-tight tracking-[-.01em]">{sendingLabel}</h2>
          <p className="mt-2 max-w-[270px] text-sm leading-relaxed text-muted">Keep this screen open until it is sent.</p>
        </div>
      )}

      {phase === "success" && (
        <>
          <div className="mt-12 grid h-[158px] w-[158px] place-items-center rounded-full bg-[rgba(22,163,74,.07)]">
            <div className="grid h-[124px] w-[124px] place-items-center rounded-full bg-[rgba(22,163,74,.13)]">
              <div className="grid h-[86px] w-[86px] place-items-center rounded-full bg-pos text-white [box-shadow:0_18px_38px_-18px_rgba(22,163,74,.9)]">
                <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M5 13l4 4L19 7" />
                </svg>
              </div>
            </div>
          </div>
          <h2 className="mt-6 text-[22px] font-semibold leading-tight tracking-[-.01em]">{successTitle}</h2>
          {successMessage && <p className="mt-2 max-w-[270px] text-[14.5px] leading-relaxed text-muted">{successMessage}</p>}
          <Button className="mt-auto" onClick={onDone}>{doneLabel}</Button>
        </>
      )}

      {phase === "error" && (
        <>
          <div className="mt-12 grid h-[158px] w-[158px] place-items-center rounded-full bg-[rgba(192,69,59,.07)]">
            <div className="grid h-[124px] w-[124px] place-items-center rounded-full bg-[rgba(192,69,59,.12)]">
              <div className="grid h-[86px] w-[86px] place-items-center rounded-full bg-neg text-white [box-shadow:0_18px_38px_-18px_rgba(192,69,59,.78)]">
                <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.25} strokeLinecap="round" aria-hidden="true">
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </div>
            </div>
          </div>
          <h2 className="mt-6 text-[22px] font-semibold leading-tight tracking-[-.01em]">{errorTitle}</h2>
          {errorMessage && <p className="mt-2 max-w-[280px] text-[14.5px] leading-relaxed text-muted">{errorMessage}</p>}
          <div className="mt-auto flex w-full flex-col gap-2.5">
            {onRetry && <Button onClick={onRetry}>{retryLabel}</Button>}
            <Button variant={onRetry ? "glass" : "ink"} onClick={onBack}>{backLabel}</Button>
          </div>
        </>
      )}
    </div>
  );
}
