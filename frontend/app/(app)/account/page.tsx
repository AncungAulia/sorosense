"use client";
import { useState } from "react";
import { Button, Card, Switch, Toast } from "../../../components/ui";
import { Identicon } from "../../../components/account/Identicon";
import { LogoutSheet } from "../../../components/account/LogoutSheet";
import { useAutoCompound } from "../../../hooks/useAutoCompound";
import { useNav } from "../../../hooks/useNav";
import { useWallet } from "../../../hooks/useWallet";
import { useRedirectDesktopToHome } from "../../../hooks/useRedirectDesktopToHome";

const truncate = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

/**
 * Account screen. Two state-changing actions, both explicit: `disconnect()` behind `LogoutSheet`,
 * and the auto-reinvest switch (a wallet-signed seam write — see the note above the row). Everything
 * else is a display of facts the wallet/vault seams actually have.
 */
export default function AccountPage() {
  const nav = useNav();
  const { address, walletName, disconnect } = useWallet();
  const [toast, setToast] = useState("");
  const [confirming, setConfirming] = useState(false);
  const notify = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(""), 2000);
  };
  const { enabled, loading, pending, toggle } = useAutoCompound(notify);
  // Account is a mobile-only surface; on desktop the avatar dropdown replaces it — redirect visitors.
  const redirecting = useRedirectDesktopToHome();

  // Hydration (KTD7): wallet/vault reads resolve after mount, so bail out cleanly until an
  // address exists rather than rendering with an undefined identity.
  if (redirecting || !address) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      notify("Address copied");
    } catch {
      // A non-secure context has no `navigator.clipboard`. Say so rather than silently doing nothing.
      notify("Could not copy address");
    }
  };

  const logout = async () => {
    setConfirming(false);
    await disconnect();
    nav.forward("/");
  };

  return (
    <div>
      <div className="pb-1.5 pt-3.5 text-center">
        <Identicon address={address} />
        <button
          onClick={copy}
          className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[#EAEAEA] px-3 font-mono text-[13px] font-medium"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="9" y="9" width="11" height="11" rx="2" />
            <path d="M5 15V5a2 2 0 0 1 2-2h10" />
          </svg>
          {truncate(address)}
        </button>
        {/*
          The mock reads "Connected via Freighter · since July 2026". Nothing records when the
          wallet first connected — the seam has no such field — so the `· since …` clause is cut
          rather than invented or backfilled from a locally-stored "first seen" date.
        */}
        <p className="mt-2.5 text-[13px] text-muted">Connected via {walletName ?? "your wallet"}</p>
      </div>

      <Card className="mt-5 px-5 py-1">
        {/* `.listrow` in mock-2: the icon sits bare, at 22px. No badge, no fill behind it. */}
        <button onClick={() => nav.forward("/account/activity")} className="flex w-full items-center gap-[13px] py-3.5 text-left">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden="true">
            <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
          </svg>
          <span className="grow">
            <span className="block font-semibold">Activity</span>
            <span className="block text-[12.5px] text-muted">All agent and account actions</span>
          </span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="text-muted" aria-hidden="true">
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>
      </Card>

      {/*
        A LIVE toggle (STE-38): it reads and writes the depositor's auto-compound preference through
        the seam, wallet-signed. It is not consent — STE-26 forbade a *consent* write from this tab
        because the safety mandate is one-time and irrevocable (KTD3), so a switch would promise an
        "off" the contract cannot deliver. Auto-compound is the opposite: a freely-revocable economic
        preference that grants no mandate, so that constraint does not transfer. Toggling it never
        calls `setPolicyConsent` and never changes `hasConsent`; revoking stops reinvest only —
        allocate, rebalance and freeze-exit are unaffected.
      */}
      <Card className="mt-4 px-5 py-1">
        <div className="flex items-center gap-[13px] py-3.5">
          {/* Two arcs, each with its own arrowhead — rewards cycle back in, they don't merely spin. */}
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden="true">
            <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path d="M3 3v5h5" />
            <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
            <path d="M21 21v-5h-5" />
          </svg>
          <span className="grow">
            <span className="block font-semibold">Auto reinvest rewards</span>
            <span className="block text-[12.5px] text-muted">Yield rewards flow back into your pool</span>
          </span>
          <span data-testid="auto-compound-state" data-state={enabled ? "on" : "off"}>
            {/* Dimmed (and unpressable) until the read lands and while the write is in flight, so a
                double-press cannot fire two transactions. */}
            <Switch
              checked={enabled}
              label="Auto reinvest rewards"
              readOnly={loading || pending}
              onChange={() => void toggle()}
            />
          </span>
        </div>
      </Card>

      {/*
        `.pill-btn.b-soft` is the glass Button; only the label takes the negative accent. The `!`
        is load-bearing: `variant="glass"` already sets `text-ink-2`, and which of two same-specificity
        utilities wins depends on their order in the generated stylesheet, not in this string.
      */}
      <Button variant="glass" className="mt-4 text-neg!" onClick={() => setConfirming(true)}>
        Log out
      </Button>

      <LogoutSheet open={confirming} onClose={() => setConfirming(false)} onConfirm={logout} />
      <Toast open={!!toast} message={toast} />
    </div>
  );
}
