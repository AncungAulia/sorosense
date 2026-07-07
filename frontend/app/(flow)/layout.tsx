"use client";
import type { ReactNode } from "react";
import { AuthGate } from "../../components/AuthGate";

export default function FlowLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGate>
      <div className="relative min-h-dvh bg-bg px-5 pb-10 pt-[52px]">{children}</div>
    </AuthGate>
  );
}
