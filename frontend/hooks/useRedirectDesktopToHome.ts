"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useIsDesktop } from "./useIsDesktop";

/**
 * Mobile-only surfaces (Earn, Account) have no desktop layout — the desktop IA folds them into the
 * one-page Overview + the account dropdown. If a desktop user reaches such a route by URL, send them
 * to /home. Returns `true` while redirecting so the caller can render nothing (avoids showing the
 * mobile page at desktop width). `useIsDesktop` is `false` during SSR/first paint, so mobile is
 * untouched — the redirect only fires once the client confirms a desktop viewport.
 */
export function useRedirectDesktopToHome(): boolean {
  const isDesktop = useIsDesktop();
  const router = useRouter();
  useEffect(() => {
    if (isDesktop) router.replace("/home");
  }, [isDesktop, router]);
  return isDesktop;
}
