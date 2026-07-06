"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const TABS = [
  { href: "/home", label: "Home", icon: <path d="M4 11l8-7 8 7M6 10v9h12v-9" /> },
  { href: "/earn", label: "Earn", icon: <path d="M4 20V4M4 20h16" /> },
  { href: "/account", label: "Account", icon: <><circle cx="12" cy="8" r="4" /><path d="M4 20a8 8 0 0 1 16 0" /></> },
] as const;

function Icon({ children }: { children: ReactNode }) {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">{children}</svg>;
}

export function BottomNav() {
  const path = usePathname();
  return (
    <>
      {/* progressive blur overlay above the nav */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 z-[38] h-[104px] overflow-hidden rounded-b-[37px]">
        <div className="absolute inset-0 [backdrop-filter:blur(2px)] [mask-image:linear-gradient(to_top,#000_0%,#000_52%,transparent_100%)]" />
        <div className="absolute inset-0 [backdrop-filter:blur(5px)] [mask-image:linear-gradient(to_top,#000_0%,#000_30%,transparent_58%)]" />
        <div className="absolute inset-0 [backdrop-filter:blur(9px)] [mask-image:linear-gradient(to_top,#000_0%,#000_15%,transparent_36%)]" />
        <div className="absolute inset-0 [background:linear-gradient(180deg,transparent,rgba(242,242,242,.5))]" />
      </div>
      <nav aria-label="Main" className="absolute inset-x-0 bottom-0 z-40 flex h-[88px] items-start justify-around px-6 pt-2.5 pb-[calc(20px+env(safe-area-inset-bottom))]">
        {TABS.map((t) => {
          const active = path === t.href;
          return (
            <Link key={t.href} href={t.href} aria-current={active ? "page" : undefined}
              className={`flex h-[52px] flex-col items-center justify-center gap-[3px] rounded-[18px] border border-transparent px-[18px] text-[11px] font-medium ${active ? "border-white bg-card text-ink [box-shadow:0_1px_2px_rgba(17,19,22,.04),0_8px_18px_-10px_rgba(17,19,22,.18)]" : "text-faint"}`}>
              <Icon>{t.icon}</Icon>{t.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
