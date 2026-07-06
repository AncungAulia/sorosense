import { render, screen } from "@testing-library/react";
import { BottomNav } from "../BottomNav";

vi.mock("next/navigation", () => ({ usePathname: () => "/earn" }));
vi.mock("next/link", () => ({ default: ({ href, children, ...p }: any) => <a href={href} {...p}>{children}</a> }));

test("marks the active tab by pathname", () => {
  render(<BottomNav />);
  expect(screen.getByRole("link", { name: /Earn/ })).toHaveAttribute("aria-current", "page");
  expect(screen.getByRole("link", { name: /Home/ })).not.toHaveAttribute("aria-current");
});
