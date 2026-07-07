"use client";
import type { ReactNode } from "react";
import { AuthGate } from "../../components/AuthGate";
import { BottomNav, TopBlur } from "../../components/ui";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGate>
      <div className="relative min-h-dvh">
        <TopBlur />
        <div className="px-5 pb-[120px] pt-14">{children}</div>
        <BottomNav />
      </div>
    </AuthGate>
  );
}
