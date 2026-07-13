import type { ComponentProps } from "react";
import { render, screen } from "@testing-library/react";
import AppLayout from "../layout";

const push = vi.fn();
vi.mock("next/navigation", () => ({ usePathname: () => "/home", useRouter: () => ({ push }) }));
vi.mock("next/link", () => ({ default: (props: ComponentProps<"a">) => <a {...props} /> }));
const useWallet = vi.fn();
vi.mock("../../../hooks/useWallet", () => ({ useWallet: () => useWallet() }));

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
