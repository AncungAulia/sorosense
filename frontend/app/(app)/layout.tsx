"use client";
import { useRef, useState, type ReactNode, type TouchEvent } from "react";
import { usePathname } from "next/navigation";
import { AuthGate } from "../../components/AuthGate";
import { BottomNav, TopBlur } from "../../components/ui";
import { TopBar } from "../../components/ui/TopBar";
import { AccountMenu } from "../../components/desktop/AccountMenu";
import { useNav } from "../../hooks/useNav";
import { useIsDesktop } from "../../hooks/useIsDesktop";

const SHELL_ROUTES = ["/home", "/earn", "/account"] as const;
type ShellRoute = (typeof SHELL_ROUTES)[number];
type SwipeStart = { x: number; y: number };

export default function AppLayout({ children }: { children: ReactNode }) {
  const nav = useNav();
  const isDesktop = useIsDesktop();
  const pathname = usePathname();
  const swipeStart = useRef<SwipeStart | null>(null);
  const [enterDirection, setEnterDirection] = useState<"next" | "prev">("next");
  const routeIndex = SHELL_ROUTES.indexOf(pathname as ShellRoute);

  const onTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    if (isDesktop || routeIndex === -1 || event.touches.length !== 1) return;
    const touch = event.touches[0];
    if (!touch) return;
    swipeStart.current = { x: touch.clientX, y: touch.clientY };
  };

  const onTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    const start = swipeStart.current;
    swipeStart.current = null;
    if (isDesktop || routeIndex === -1 || !start) return;
    const touch = event.changedTouches[0];
    if (!touch) return;

    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    const mostlyHorizontal = Math.abs(dx) > Math.abs(dy) * 1.35;
    const committed = Math.abs(dx) >= 68 && mostlyHorizontal;
    if (!committed) return;

    const nextIndex = dx < 0 ? routeIndex + 1 : routeIndex - 1;
    const nextRoute = SHELL_ROUTES[nextIndex];
    if (!nextRoute) return;

    setEnterDirection(dx < 0 ? "next" : "prev");
    nav.forward(nextRoute);
  };

  return (
    <AuthGate>
      <div
        className="relative min-h-dvh"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onTouchCancel={() => {
          swipeStart.current = null;
        }}
      >
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
            <TopBar account={isDesktop ? <AccountMenu /> : undefined} onAvatarClick={() => nav.forward("/account")} />
          </div>
          <div key={pathname} className={isDesktop ? undefined : `page-enter ${enterDirection === "prev" ? "page-enter-prev" : ""}`}>
            {children}
          </div>
        </div>

        {/* Mobile-only bottom nav */}
        <div className="lg:hidden">
          <BottomNav />
        </div>
      </div>
    </AuthGate>
  );
}
