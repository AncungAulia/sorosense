"use client";
import { useRouter } from "next/navigation";

/**
 * App navigation helper. `forward` tags the navigation as `nav-forward` so the new
 * page slides in from the right (native push), styled by the `::view-transition`
 * rules in globals.css. `back` uses the browser history pop (default crossfade).
 * Reuse everywhere instead of calling `router.push` directly for forward moves.
 */
export function useNav() {
  const router = useRouter();
  return {
    forward: (href: string) => router.push(href, { transitionTypes: ["nav-forward"] }),
    back: () => router.back(),
  };
}
