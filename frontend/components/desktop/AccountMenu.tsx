"use client";
import { useState } from "react";
import { Dropdown } from "../ui/Dropdown";
import { Switch } from "../ui";
import { Identicon } from "../account/Identicon";
import { LogoutSheet } from "../account/LogoutSheet";
import { FaucetButton } from "../deposit/FaucetButton";
import { useWallet } from "../../hooks/useWallet";
import { useAutoCompound } from "../../hooks/useAutoCompound";
import { useNav } from "../../hooks/useNav";
import { usePanel } from "../../hooks/usePanel";
import { useToast } from "../../hooks/useToast";

const truncate = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

/**
 * Desktop account dropdown — the pieces of account/page.tsx (interface-map §7) assembled into the
 * mockup's `.dropdown` (§14): copy-address pill, Activity row → activity drawer, the live
 * auto-reinvest Switch (STE-38 — same hook, same behavior as the mobile Account row; desktop
 * redirects `/account` to Home, so this is the only desktop surface for it), Log out → LogoutSheet →
 * disconnect. The mockup's logout row was a placeholder close(); here it wires the real confirm.
 */
export function AccountMenu() {
  const { address, walletName, disconnect } = useWallet();
  const { show } = useToast();
  const { enabled, loading, pending, toggle } = useAutoCompound(show);
  const nav = useNav();
  const { open: openPanel } = usePanel();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const copy = async () => {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* non-secure context: no clipboard — leave the pill unchanged */
    }
  };
  const logout = async () => {
    setConfirming(false);
    setOpen(false);
    await disconnect();
    nav.forward("/");
  };

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Account"
        onClick={() => setOpen((o) => !o)}
        className="grid h-[42px] w-[42px] place-items-center overflow-hidden rounded-full border border-line bg-[#e8e8e6] p-0 [box-shadow:0_1px_2px_rgba(17,19,22,.04),0_8px_18px_-10px_rgba(17,19,22,.18)]"
      >
        <Identicon address={address ?? ""} size={42} />
      </button>
      <Dropdown open={open} onClose={() => setOpen(false)} label="Account">
        <div className="flex flex-col items-center gap-2.5 px-3.5 pb-3 pt-4 text-center">
          <button onClick={copy} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[#EAEAEA] px-3 font-mono text-[13px] font-medium text-ink-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>
            {copied ? "Copied" : address ? truncate(address) : ""}
          </button>
          <span className="text-[12.5px] text-muted">Connected via {walletName ?? "your wallet"}</span>
        </div>
        {/* Testnet faucet — mint USDC to a fresh wallet, with a per-address cooldown. Renders only in
            integration mode (apiEnabled + issuer configured); returns null in mock/offline. */}
        <FaucetButton currency="USD" />
        <div className="mx-2 my-1.5 h-px bg-line" />
        <button role="menuitem" onClick={() => { setOpen(false); openPanel("activity"); }} className="flex w-full items-center gap-[13px] rounded-xl px-3 py-2.5 text-left hover:bg-pill">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-ink-2"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></svg>
          <span className="grow"><span className="block text-sm font-semibold">Activity</span><span className="block text-xs text-muted">All agent and account actions</span></span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="text-muted"><path d="M9 6l6 6-6 6" /></svg>
        </button>
        <div className="flex w-full items-center gap-[13px] px-3 py-2.5">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-ink-2"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" /><path d="M21 21v-5h-5" /></svg>
          <span className="grow"><span className="block text-sm font-semibold">Auto reinvest rewards</span><span className="block text-xs text-muted">Yield rewards flow back into your pool</span></span>
          <span data-testid="auto-compound-state" data-state={enabled ? "on" : "off"}><Switch checked={enabled} label="Auto reinvest rewards" readOnly={loading || pending} onChange={() => void toggle()} /></span>
        </div>
        <div className="mx-2 my-1.5 h-px bg-line" />
        <button role="menuitem" onClick={() => setConfirming(true)} className="flex w-full items-center gap-[13px] rounded-xl px-3 py-2.5 text-left font-semibold text-neg hover:bg-pill">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><path d="M14 3H5v18h9M10 8l4 4-4 4M14 12H6" /></svg>
          Log out
        </button>
      </Dropdown>
      <LogoutSheet open={confirming} onClose={() => setConfirming(false)} onConfirm={logout} />
    </div>
  );
}
