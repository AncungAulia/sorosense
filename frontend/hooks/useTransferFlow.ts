"use client";
import { useCallback, useRef, useState } from "react";
import { toWalletError, USER_CLOSED_MODAL } from "../lib/wallet-error";

export type TransferPhase = "idle" | "sending" | "success" | "error";

/**
 * Drives the deposit/withdraw status flow: idle → sending → success | error. `run(submit)` sets
 * `sending`, awaits the (already-signed) submit against a small floor so the spinner is actually seen
 * even when the mock resolves instantly, then flips to `success`. A wallet-cancelled sign
 * (USER_CLOSED_MODAL) drops back to `idle` (the form), not an error. `retry` re-runs the last submit;
 * `reset` returns to the form. The real network latency (STE-52) simply replaces the min-duration
 * floor — no caller changes.
 */
export function useTransferFlow(minMs = 600) {
  const [phase, setPhase] = useState<TransferPhase>("idle");
  const [error, setError] = useState("");
  const last = useRef<(() => Promise<void>) | null>(null);

  const run = useCallback(
    async (submit: () => Promise<void>) => {
      last.current = submit;
      setPhase("sending");
      setError("");
      try {
        await Promise.all([submit(), new Promise((r) => setTimeout(r, minMs))]);
        setPhase("success");
      } catch (e) {
        const w = toWalletError(e);
        if (w.code === USER_CLOSED_MODAL) {
          setPhase("idle"); // user backed out of the wallet — return to the form, not an error
          return;
        }
        setError(w.message);
        setPhase("error");
      }
    },
    [minMs],
  );

  const retry = useCallback(() => {
    if (last.current) void run(last.current);
  }, [run]);

  const reset = useCallback(() => {
    setPhase("idle");
    setError("");
  }, []);

  return { phase, error, run, retry, reset };
}
