import type { ComponentProps } from "react";
import { render, screen } from "@testing-library/react";
import FlowLayout from "../layout";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), back: vi.fn() }) }));
vi.mock("next/link", () => ({ default: (props: ComponentProps<"a">) => <a {...props} /> }));
const useWallet = vi.fn();
vi.mock("../../../hooks/useWallet", () => ({ useWallet: () => useWallet() }));

test("flow layout renders children and no bottom nav", () => {
  useWallet.mockReturnValue({ isConnected: true });
  render(<FlowLayout><p>flow body</p></FlowLayout>);
  expect(screen.getByText("flow body")).toBeInTheDocument();
  expect(screen.queryByRole("navigation", { name: "Main" })).not.toBeInTheDocument();
});
