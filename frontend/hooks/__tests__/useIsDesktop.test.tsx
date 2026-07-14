import { renderHook } from "@testing-library/react";
import { useIsDesktop } from "../useIsDesktop";

function mockMatchMedia(matches: boolean) {
  window.matchMedia = (q: string) => ({
    matches, media: q, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  }) as unknown as MediaQueryList;
}

test("false before mount, true when the desktop query matches", () => {
  mockMatchMedia(true);
  const { result } = renderHook(() => useIsDesktop());
  expect(result.current).toBe(true);
});

test("false when the query does not match", () => {
  mockMatchMedia(false);
  const { result } = renderHook(() => useIsDesktop());
  expect(result.current).toBe(false);
});
