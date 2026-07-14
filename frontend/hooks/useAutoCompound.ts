"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useWallet } from "./useWallet";
import { useVault } from "./useVault";
import { depositorSigner } from "../lib/vault/signer";
import { toWalletError, USER_CLOSED_MODAL } from "../lib/wallet-error";

/**
 * The depositor's auto-compound (reinvest-rewards) preference — a live, revocable toggle over the
 * seam's `autoCompoundEnabled` / `setAutoCompound` (STE-38).
 *
 * It is NOT consent. `setPolicyConsent` is the one-time, irrevocable safety mandate (KTD3); this is
 * an economic preference the depositor may flip as often as they like, and toggling it never touches
 * `hasConsent`. Revoking it stops reinvest only — allocate, rebalance and freeze-exit are unaffected
 * (the keeper's `gateCompound` enforces that side).
 *
 * Fail-OPEN, unlike {@link useConsent}: the seam's documented default is enabled (unset = ON) and
 * reinvesting moves nothing out of the user's bucket. Rendering "Off" on a failed read would
 * misreport a user whose preference is actually ON and invite a pointless write, so a rejected read
 * renders ON and logs the cause (never swallows it). The safety-critical direction is already
 * fail-closed where it matters: the keeper treats an unreadable preference as OFF and never
 * reinvests unverified.
 *
 * @param onError Surfaces a failed/declined write to the caller's toast — the mobile Account screen
 *   has a local `<Toast>`, desktop uses the global `useToast().show`, so the hook does not pick one.
 */
export function useAutoCompound(onError?: (message: string) => void): {
  loading: boolean;
  enabled: boolean;
  pending: boolean;
  toggle: () => Promise<void>;
} {
  const { address, signTransaction } = useWallet();
  const { client, version, bump } = useVault();
  const [state, setState] = useState({ loading: true, enabled: true });
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);
  // Callers pass an inline arrow; a ref keeps `toggle` stable instead of re-creating it every render.
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onErrorRef.current = onError;
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!address) {
        // No wallet: nothing to read. ON is the seam's default for an unset preference, so it is also
        // the honest placeholder — the surfaces gate on `address` before rendering anything anyway.
        if (!cancelled) setState({ loading: false, enabled: true });
        return;
      }
      try {
        const enabled = await client.autoCompoundEnabled(address);
        if (!cancelled) setState({ loading: false, enabled });
      } catch (e) {
        console.error("useAutoCompound: autoCompoundEnabled read failed, rendering On (seam default)", e);
        if (!cancelled) setState({ loading: false, enabled: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [address, client, version]);

  const toggle = useCallback(async () => {
    // `inFlight` (not `pending`) guards the write: state updates are async, so a double-press within
    // one render tick would otherwise fire two transactions.
    if (inFlight.current || !address || state.loading) return;
    const next = !state.enabled;
    inFlight.current = true;
    setPending(true);
    try {
      await client.setAutoCompound(address, next).signAndSubmit(depositorSigner(address, signTransaction));
      // Show the new position immediately, then bump() so the seam re-read is the source of truth.
      setState({ loading: false, enabled: next });
      bump();
    } catch (e) {
      // Nothing was written optimistically, so the switch is already sitting in its prior position —
      // there is no lying state to revert. Say what happened instead of failing silently.
      const w = toWalletError(e);
      onErrorRef.current?.(
        w.code === USER_CLOSED_MODAL ? "Signature cancelled. Nothing changed." : w.message,
      );
    } finally {
      setPending(false);
      inFlight.current = false;
    }
  }, [address, client, signTransaction, bump, state.enabled, state.loading]);

  return { loading: state.loading, enabled: state.enabled, pending, toggle };
}
