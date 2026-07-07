"use client";
import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "../hooks/useWallet";

export function AuthGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { isConnected } = useWallet();
  useEffect(() => {
    if (!isConnected) router.push("/");
  }, [isConnected, router]);
  return <>{children}</>;
}
