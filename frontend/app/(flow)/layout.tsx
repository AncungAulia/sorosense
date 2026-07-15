"use client";
import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AuthGate } from "../../components/AuthGate";
import { useIsDesktop } from "../../hooks/useIsDesktop";

/**
 * Desktop has no full-page flows — Deposit / Withdraw / Activity are drawers on the Overview,
 * and there is no desktop design for these routes. A desktop visitor who reaches a (flow) URL (typed,
 * bookmarked, or a stale deep link) is sent to /home with the matching drawer open; anything else
 * falls back to /home. Mobile is untouched: `useIsDesktop` is false there, so children render as
 * before. This lives in the layout so the shared flow components (AddFunds/DepositKeypad/…) stay
 * byte-identical — desktop UI never navigates here (it uses `open(panel)`), only manual URLs do.
 */
const PANEL_ROUTES: { match: (path: string) => boolean; to: string }[] = [
  { match: (p) => p === "/add-funds" || p === "/deposit" || p.startsWith("/deposit/"), to: "/home?panel=deposit" },
  { match: (p) => p === "/withdraw", to: "/home?panel=withdraw" },
  { match: (p) => p === "/account/activity", to: "/home?panel=activity" },
];

export default function FlowLayout({ children }: { children: ReactNode }) {
  const isDesktop = useIsDesktop();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!isDesktop) return;
    const target = PANEL_ROUTES.find((r) => r.match(pathname))?.to ?? "/home";
    router.replace(target);
  }, [isDesktop, pathname, router]);

  return (
    <AuthGate>
      <div className="relative min-h-dvh bg-bg px-5 pb-10 pt-[52px]">{isDesktop ? null : children}</div>
    </AuthGate>
  );
}
