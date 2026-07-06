"use client";
import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "../../hooks/useWallet";
import { BottomNav } from "../../components/ui";

export default function AppLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { isConnected } = useWallet();

  useEffect(() => {
    if (!isConnected) router.push("/");
  }, [isConnected, router]);

  return (
    <div className="relative min-h-dvh">
      <div className="px-5 pb-[120px] pt-2">{children}</div>
      <BottomNav />
    </div>
  );
}
