"use client";
import { useState } from "react";
import { Button, Card, Switch, Toast } from "../../../components/ui";
import { Identicon } from "../../../components/account/Identicon";
import { LogoutSheet } from "../../../components/account/LogoutSheet";
import { useConsent } from "../../../hooks/useConsent";
import { useNav } from "../../../hooks/useNav";
import { useWallet } from "../../../hooks/useWallet";

const truncate = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

/**
 * Read-only account screen. The only state-changing action is `disconnect()`, gated behind
 * `LogoutSheet`. Everything else here is a display of facts the wallet/vault seams actually have —
 * see the two inline notes below for what was deliberately left out and why.
 */
export default function AccountPage() {
  const nav = useNav();
  const { address, walletName, disconnect } = useWallet();
  const { enabled } = useConsent();
  const [toast, setToast] = useState("");
  const [confirming, setConfirming] = useState(false);

  // Hydration (KTD7): wallet/vault reads resolve after mount, so bail out cleanly until an
  // address exists rather than rendering with an undefined identity.
  if (!address) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setToast("Address copied");
    } catch {
      // A non-secure context has no `navigator.clipboard`. Say so rather than silently doing nothing.
      setToast("Could not copy address");
    }
    setTimeout(() => setToast(""), 2000);
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
        The switch is READ-ONLY: it displays consent, it does not grant or revoke it. The seam has
        only `setPolicyConsent()` (idempotent) and `hasConsent()` (boolean) — there is no revoke, and
        granting is a write, which STE-26 forbids from this tab ("no execution path from either
        tab"). Consent is granted once, in the deposit flow. Making this switch live spans the
        contract and the keeper: STE-38 / STE-39 / STE-40, running in parallel with this unit.
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
          <span data-testid="consent-state" data-state={enabled ? "on" : "off"}>
            <Switch checked={enabled} label="Auto reinvest rewards" readOnly />
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
