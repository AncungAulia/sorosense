import type { ComponentProps } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import FlowLayout from "../layout";

const nav = vi.hoisted(() => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => nav, usePathname: () => "/deposit" }));
vi.mock("next/link", () => ({ default: (props: ComponentProps<"a">) => <a {...props} /> }));
const useWallet = vi.fn();
vi.mock("../../../hooks/useWallet", () => ({ useWallet: () => useWallet() }));

function mockMatchMedia(matches: boolean) {
  window.matchMedia = ((q: string) => ({
    matches, media: q, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  nav.replace.mockClear();
  // jsdom has no matchMedia by default; useIsDesktop guards that and stays false (mobile).
  delete (window as { matchMedia?: unknown }).matchMedia;
});

test("mobile: flow layout renders children and no bottom nav", () => {
  useWallet.mockReturnValue({ isConnected: true, hydrated: true });
  render(<FlowLayout><p>flow body</p></FlowLayout>);
  expect(screen.getByText("flow body")).toBeInTheDocument();
  expect(screen.queryByRole("navigation", { name: "Main" })).not.toBeInTheDocument();
  expect(nav.replace).not.toHaveBeenCalled();
});

test("desktop: a flow-route visitor is redirected to the matching drawer, children not shown", async () => {
  useWallet.mockReturnValue({ isConnected: true, hydrated: true });
  mockMatchMedia(true); // desktop viewport → /deposit maps to the deposit drawer
  render(<FlowLayout><p>flow body</p></FlowLayout>);
  await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/home?panel=deposit"));
  expect(screen.queryByText("flow body")).toBeNull();
});
