"use client";
import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "../hooks/useWallet";

export function AuthGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { isConnected, hydrated } = useWallet();
  // Wait for WalletProvider to hydrate before deciding. React runs child effects before parent
  // ones, so on a hard load `address` is still undefined here on the first pass — redirecting then
  // would bounce a valid session out (STE-43). Only push once hydration has resolved the session.
  useEffect(() => {
    if (hydrated && !isConnected) router.push("/");
  }, [hydrated, isConnected, router]);
  if (!hydrated) return null; // still deciding — no flash, no bounce
  if (!isConnected) return null; // redirecting
  return <>{children}</>;
}
