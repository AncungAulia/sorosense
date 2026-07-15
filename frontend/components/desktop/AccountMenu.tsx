"use client";

import { useState } from "react";
import { Dropdown } from "../ui/Dropdown";
import { Switch } from "../ui";
import { FaucetSection } from "../account/FaucetSection";
import { Identicon } from "../account/Identicon";
import { LogoutSheet } from "../account/LogoutSheet";
import { useWallet } from "../../hooks/useWallet";
import { useAutoCompound } from "../../hooks/useAutoCompound";
import { useNav } from "../../hooks/useNav";
import { usePanel } from "../../hooks/usePanel";
import { useToast } from "../../hooks/useToast";

const truncate = (address: string) => `${address.slice(0, 4)}...${address.slice(-4)}`;

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
      /* non-secure context: no clipboard */
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
        onClick={() => setOpen((value) => !value)}
        className="grid h-[42px] w-[42px] place-items-center overflow-hidden rounded-full border border-white bg-card p-0 [box-shadow:0_1px_2px_rgba(17,19,22,.04),0_8px_18px_-10px_rgba(17,19,22,.22)]"
      >
        <Identicon address={address ?? ""} size={42} />
      </button>
      <Dropdown open={open} onClose={() => setOpen(false)} label="Account">
        <div className="flex items-center gap-3 px-3.5 pb-3 pt-4">
          <Identicon address={address ?? ""} size={58} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate font-mono text-[18px] font-semibold text-ink">
                {copied ? "Copied" : address ? truncate(address) : ""}
              </span>
              <button
                type="button"
                aria-label="Copy address"
                onClick={copy}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-2 transition-colors hover:bg-pill"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="9" y="9" width="11" height="11" rx="2" />
                  <path d="M5 15V5a2 2 0 0 1 2-2h10" />
                </svg>
              </button>
            </div>
            <span className="mt-1 block text-[13px] font-medium text-muted">Connected via {walletName ?? "your wallet"}</span>
          </div>
        </div>

        <div className="px-2 pb-1 pt-1.5">
          <h2 className="mb-2 px-1 text-[12px] font-semibold text-muted">General</h2>
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false);
              openPanel("activity");
            }}
            className="flex w-full items-center gap-[13px] rounded-xl px-3 py-2.5 text-left hover:bg-pill"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-ink-2">
              <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
            </svg>
            <span className="grow">
              <span className="block text-sm font-semibold">Activity</span>
              <span className="block text-xs text-muted">All agent and account actions</span>
            </span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="text-muted">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>
          <div className="flex w-full items-center gap-[13px] rounded-xl px-3 py-2.5">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-ink-2">
              <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
              <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
              <path d="M21 21v-5h-5" />
            </svg>
            <span className="grow">
              <span className="block text-sm font-semibold">Auto reinvest rewards</span>
              <span className="block text-xs text-muted">Yield rewards flow back into your pool</span>
            </span>
            <span data-testid="auto-compound-state" data-state={enabled ? "on" : "off"}>
              <Switch checked={enabled} label="Auto reinvest rewards" readOnly={loading || pending} onChange={() => void toggle()} />
            </span>
          </div>
        </div>

        <FaucetSection compact />

        <div className="mx-2 my-1.5 h-px bg-line" />
        <button role="menuitem" onClick={() => setConfirming(true)} className="flex w-full items-center gap-[13px] rounded-xl px-3 py-2.5 text-left font-semibold text-neg hover:bg-pill">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
            <path d="M14 3H5v18h9M10 8l4 4-4 4M14 12H6" />
          </svg>
          Log out
        </button>
      </Dropdown>
      <LogoutSheet open={confirming} onClose={() => setConfirming(false)} onConfirm={logout} />
    </div>
  );
}
