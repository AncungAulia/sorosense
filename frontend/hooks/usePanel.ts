"use client";
import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export type Panel = "add-funds" | "move-to-wallet" | "activity" | "safe-exit";
const PANELS: readonly Panel[] = ["add-funds", "move-to-wallet", "activity", "safe-exit"];

/**
 * URL-backed desktop overlay state. The `?panel=` search param is the single source of truth, so
 * Back/refresh/deep-link/share all behave (STE-43). `open` pushes (Back closes the overlay); `close`
 * replaces (a dismissed overlay leaves no history entry). Desktop-only consumers; mobile keeps
 * `nav.forward(route)`.
 */
export function usePanel(): { panel: Panel | null; open: (name: Panel) => void; close: () => void } {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const raw = params.get("panel");
  const panel = PANELS.includes(raw as Panel) ? (raw as Panel) : null;

  const open = useCallback(
    (name: Panel) => {
      const next = new URLSearchParams(params.toString());
      next.set("panel", name);
      router.push(`${pathname}?${next.toString()}`);
    },
    [params, pathname, router],
  );

  const close = useCallback(() => {
    const next = new URLSearchParams(params.toString());
    next.delete("panel");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }, [params, pathname, router]);

  return { panel, open, close };
}
