"use client";
import { useCallback, useRef, useState } from "react";
import type { TxResult } from "@sorosense/vault-client";
import { toWalletError, USER_CLOSED_MODAL } from "../lib/wallet-error";
import { TX_REJECTED_MESSAGE } from "../lib/vault/tx";

export type TransferPhase = "idle" | "sending" | "success" | "error";

/** What a submit hands back: the chain's verdict, or nothing when it had no write to make. */
export type TransferSubmit = () => Promise<TxResult | void>;

/**
 * Drives the deposit/withdraw status flow: idle → sending → success | error. `run(submit)` sets
 * `sending`, awaits the (already-signed) submit against a small floor so the spinner is actually seen
 * even when the mock resolves instantly, then flips to `success`. A wallet-cancelled sign
 * (USER_CLOSED_MODAL) drops back to `idle` (the form), not an error. `retry` re-runs the last submit;
 * `reset` returns to the form. The real network latency (STE-52) simply replaces the min-duration
 * floor — no caller changes.
 *
 * A submit that returns a `TxResult` with `success: false` lands in `error`, never `success`: the seam
 * reports a submitted-but-rejected transaction that way instead of throwing, so a resolved promise is
 * not proof the chain accepted anything (R5, KTD4). Returning nothing means there was no write to
 * judge (e.g. a zero amount) and keeps today's behavior.
 */
export function useTransferFlow(minMs = 600) {
  const [phase, setPhase] = useState<TransferPhase>("idle");
  const [error, setError] = useState("");
  const last = useRef<TransferSubmit | null>(null);

  const run = useCallback(
    async (submit: TransferSubmit) => {
      last.current = submit;
      setPhase("sending");
      setError("");
      try {
        const [result] = await Promise.all([submit(), new Promise((r) => setTimeout(r, minMs))]);
        if (result && !result.success) {
          setError(TX_REJECTED_MESSAGE);
          setPhase("error"); // rejected on-chain — the caller recorded no cost basis
          return;
        }
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
