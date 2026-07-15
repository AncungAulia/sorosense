import type { ComponentProps } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import AppLayout from "../layout";

const push = vi.fn();
let pathname = "/home";
vi.mock("next/navigation", () => ({ usePathname: () => pathname, useRouter: () => ({ push }) }));
vi.mock("next/link", () => ({ default: (props: ComponentProps<"a">) => <a {...props} /> }));
const useWallet = vi.fn();
vi.mock("../../../hooks/useWallet", () => ({ useWallet: () => useWallet() }));
vi.mock("../../../hooks/useIsDesktop", () => ({ useIsDesktop: () => false }));

beforeEach(() => {
  pathname = "/home";
  push.mockClear();
  useWallet.mockReset();
});

test("renders nav + children when connected", () => {
  useWallet.mockReturnValue({ isConnected: true, hydrated: true });
  render(<AppLayout><p>home body</p></AppLayout>);
  expect(screen.getByText("home body")).toBeInTheDocument();
  expect(screen.getByRole("navigation", { name: "Main" })).toBeInTheDocument();
});

test("redirects to / when not connected", () => {
  useWallet.mockReturnValue({ isConnected: false, hydrated: true });
  render(<AppLayout><p>home body</p></AppLayout>);
  expect(push).toHaveBeenCalledWith("/");
});

test("desktop chrome present: TopBar brand renders alongside the mobile bottom nav", () => {
  useWallet.mockReturnValue({ isConnected: true, hydrated: true });
  render(<AppLayout><p>home body</p></AppLayout>);
  expect(screen.getByRole("navigation", { name: "Main" })).toBeInTheDocument(); // mobile BottomNav kept
  expect(screen.getByText("SoroSense")).toBeInTheDocument();                    // desktop TopBar added
});

test("mobile shell swipe moves between the three tab routes", () => {
  useWallet.mockReturnValue({ isConnected: true, hydrated: true });
  const { container, rerender } = render(<AppLayout><p>home body</p></AppLayout>);
  const shell = container.firstElementChild as HTMLElement;

  fireEvent.touchStart(shell, { touches: [{ clientX: 320, clientY: 240 }] });
  fireEvent.touchEnd(shell, { changedTouches: [{ clientX: 180, clientY: 246 }] });
  expect(push).toHaveBeenCalledWith("/earn");

  pathname = "/earn";
  rerender(<AppLayout><p>earn body</p></AppLayout>);
  fireEvent.touchStart(shell, { touches: [{ clientX: 120, clientY: 240 }] });
  fireEvent.touchEnd(shell, { changedTouches: [{ clientX: 260, clientY: 244 }] });
  expect(push).toHaveBeenCalledWith("/home");
});
