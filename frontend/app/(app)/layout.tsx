"use client";
import type { ReactNode } from "react";
import { AuthGate } from "../../components/AuthGate";
import { BottomNav, TopBlur } from "../../components/ui";
import { TopBar } from "../../components/ui/TopBar";
import { useNav } from "../../hooks/useNav";

export default function AppLayout({ children }: { children: ReactNode }) {
  const nav = useNav();
  return (
    <AuthGate>
      <div className="relative min-h-dvh">
        {/* Mobile-only top blur strip */}
        <div className="lg:hidden">
          <TopBlur />
        </div>

        {/* Centered content column. Mobile keeps the exact px-5 pb-[120px] pt-14;
            desktop widens the column, swaps padding, and drops the bottom-nav gutter.
            Centering is mx-auto (never transform — U14). Widths from the mockup .appwin. */}
        <div className="mx-auto w-full max-w-[1200px] px-5 pb-[120px] pt-14 lg:px-9 lg:pb-11 lg:pt-[22px] xl:max-w-[1440px] 2xl:max-w-[1560px]">
          {/* Desktop-only top bar */}
          <div className="hidden lg:block">
            <TopBar onAvatarClick={() => nav.forward("/account")} />
          </div>
          {children}
        </div>

        {/* Mobile-only bottom nav */}
        <div className="lg:hidden">
          <BottomNav />
        </div>
      </div>
    </AuthGate>
  );
}
