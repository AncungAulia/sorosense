"use client";

import { useEffect, useState } from "react";
import { Button, Switch, Toast } from "../../../components/ui";
import { Identicon } from "../../../components/account/Identicon";
import { FaucetSection } from "../../../components/account/FaucetSection";
import { LogoutSheet } from "../../../components/account/LogoutSheet";
import { useAutoCompound } from "../../../hooks/useAutoCompound";
import { useNav } from "../../../hooks/useNav";
import { useWallet } from "../../../hooks/useWallet";
import { useRedirectDesktopToHome } from "../../../hooks/useRedirectDesktopToHome";

const truncate = (address: string) => `${address.slice(0, 4)}...${address.slice(-4)}`;
const mobilePanel =
  "flex w-full items-center gap-3 rounded-[16px] border border-line bg-white px-4 py-3.5 text-left " +
  "[box-shadow:0_1px_2px_rgba(17,19,22,.04),0_10px_22px_-16px_rgba(17,19,22,.22)]";

export default function AccountPage() {
  const nav = useNav();
  const { address, walletName, disconnect } = useWallet();
  const [toast, setToast] = useState<{ message: string } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const notify = (message: string) => setToast({ message });
  const { enabled, loading, pending, toggle } = useAutoCompound(notify);
  const redirecting = useRedirectDesktopToHome();

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2000);
    return () => clearTimeout(timer);
  }, [toast]);

  if (redirecting || !address) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      notify("Address copied");
    } catch {
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
      <div className="stagger">
        <div className="pb-1.5 pt-3.5 text-center">
          <Identicon address={address} />
          <button
            onClick={copy}
            className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[#EAEAEA] px-3 font-mono text-[13px] font-medium text-ink-2 transition-colors hover:bg-line"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="9" y="9" width="11" height="11" rx="2" />
              <path d="M5 15V5a2 2 0 0 1 2-2h10" />
            </svg>
            {truncate(address)}
          </button>
          <p className="mt-2.5 text-[13px] text-muted">Connected via {walletName ?? "your wallet"}</p>
        </div>

        <section className="mt-5">
          <h2 className="ml-1 mb-2.5 text-sm font-medium text-muted">General</h2>
          <div className="space-y-2.5">
            <button onClick={() => nav.forward("/account/activity")} className={mobilePanel}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden="true">
                <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
              </svg>
              <span className="min-w-0 grow">
                <span className="block font-semibold">Activity</span>
                <span className="block text-[12.5px] text-muted">All agent and account actions</span>
              </span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="shrink-0 text-muted" aria-hidden="true">
                <path d="M9 6l6 6-6 6" />
              </svg>
            </button>

            <div className={mobilePanel}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden="true">
                <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
                <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                <path d="M21 21v-5h-5" />
              </svg>
              <span className="min-w-0 grow">
                <span className="block font-semibold">Auto reinvest rewards</span>
                <span className="block text-[12.5px] text-muted">Yield rewards flow back into your pool</span>
              </span>
              <span data-testid="auto-compound-state" data-state={enabled ? "on" : "off"} className="shrink-0">
                <Switch
                  checked={enabled}
                  label="Auto reinvest rewards"
                  readOnly={loading || pending}
                  onChange={() => void toggle()}
                />
              </span>
            </div>
          </div>
        </section>

        <FaucetSection />

        <Button variant="glass" className="mt-4 text-neg!" onClick={() => setConfirming(true)}>
          Log out
        </Button>
      </div>

      <LogoutSheet open={confirming} onClose={() => setConfirming(false)} onConfirm={logout} />
      <Toast open={!!toast} message={toast?.message ?? ""} />
    </div>
  );
}
