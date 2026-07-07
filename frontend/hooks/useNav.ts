"use client";
import { useRouter } from "next/navigation";

/**
 * App navigation helper. `forward` navigates into a sub-screen; the `(flow)`
 * route group's template applies the `.page-enter` slide-in (see globals.css),
 * so forward moves animate without each call site knowing about it. `back` pops
 * history. Reuse instead of calling `router.push`/`router.back` directly.
 */
export function useNav() {
  const router = useRouter();
  return {
    forward: (href: string) => router.push(href),
    back: () => router.back(),
  };
}
