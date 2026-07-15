import { renderHook, act } from "@testing-library/react";
import { usePanel } from "../usePanel";

const h = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), search: "" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: h.push, replace: h.replace }),
  usePathname: () => "/home",
  useSearchParams: () => new URLSearchParams(h.search),
}));

beforeEach(() => {
  h.push.mockClear();
  h.replace.mockClear();
});

test("reads the current panel param", () => {
  h.search = "panel=activity";
  const { result } = renderHook(() => usePanel());
  expect(result.current.panel).toBe("activity");
});

test("an unknown panel value reads as null", () => {
  h.search = "panel=bogus";
  const { result } = renderHook(() => usePanel());
  expect(result.current.panel).toBeNull();
});

test("open pushes ?panel=", () => {
  h.search = "";
  const { result } = renderHook(() => usePanel());
  act(() => result.current.open("deposit"));
  expect(h.push).toHaveBeenCalledWith("/home?panel=deposit");
});

test("close replaces back to the bare path", () => {
  h.search = "panel=deposit";
  const { result } = renderHook(() => usePanel());
  act(() => result.current.close());
  expect(h.replace).toHaveBeenCalledWith("/home");
});
