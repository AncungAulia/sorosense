"use client";
import type { ReactNode } from "react";
import { AuthGate } from "../../components/AuthGate";
import { BottomNav } from "../../components/ui";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGate>
      <div className="relative min-h-dvh">
        <div className="px-5 pb-[120px] pt-2">{children}</div>
        <BottomNav />
      </div>
    </AuthGate>
  );
}
