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
 * misreport a user whose preference is actually ON and invite a pointless write, so an *unknown*
 * preference renders ON and logs the cause (never swallows it). The safety-critical direction is
 * already fail-closed where it matters: the keeper treats an unreadable preference as OFF and never
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
  // The preference last *confirmed* for this address — read from the seam, or written by us. Fail-open
  // means "ON when we know nothing", not "ON whenever a read fails": a rejected read must not discard
  // an answer we already have. `bump()` re-reads after every write, so without this a flaky read
  // straight after a successful revoke would snap the switch back to On while the chain says Off.
  const known = useRef<{ address: string; enabled: boolean } | null>(null);
  // One generation counter shared by the read and the write. A read still in flight when the user
  // toggles carries a pre-write answer; it must lose to the write rather than clobber it.
  const gen = useRef(0);
  // Callers pass an inline arrow; a ref keeps the effects free of a dependency that changes each render.
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onErrorRef.current = onError;
  });

  useEffect(() => {
    let cancelled = false;
    const mine = ++gen.current;
    const fresh = () => !cancelled && gen.current === mine;

    (async () => {
      if (!address) {
        // No wallet: nothing to read, and nothing known. ON is the seam's default for an unset
        // preference, so it is also the honest placeholder — the surfaces gate on `address` anyway.
        known.current = null;
        if (fresh()) setState({ loading: false, enabled: true });
        return;
      }
      // A re-read for a *different* depositor: the displayed value belongs to the previous one, so go
      // back to loading (which dims the switch) rather than leaving it pressable over a stale answer.
      // A `version` bump for the same depositor keeps showing the last known value — no flicker.
      if (known.current?.address !== address) setState((s) => (s.loading ? s : { ...s, loading: true }));
      try {
        const enabled = await client.autoCompoundEnabled(address);
        if (!fresh()) return;
        known.current = { address, enabled };
        setState({ loading: false, enabled });
      } catch (e) {
        console.error("useAutoCompound: autoCompoundEnabled read failed, keeping the last known value", e);
        if (!fresh()) return;
        setState({ loading: false, enabled: known.current?.address === address ? known.current.enabled : true });
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
    gen.current++; // any read still in flight predates this write — retire its answer
    try {
      const { success } = await client
        .setAutoCompound(address, next)
        .signAndSubmit(depositorSigner(address, signTransaction));
      // A resolved promise is not proof the chain accepted the write: the seam reports a submitted-
      // but-rejected transaction as `success: false` rather than throwing. Flipping the switch on that
      // would be a lie about the user's funds.
      if (!success) {
        onErrorRef.current?.("Could not save that. Nothing changed.");
        return;
      }
      known.current = { address, enabled: next };
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
