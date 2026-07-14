import { render, screen } from "@testing-library/react";
import { AuthGate } from "../AuthGate";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
const useWallet = vi.fn();
vi.mock("../../hooks/useWallet", () => ({ useWallet: () => useWallet() }));

afterEach(() => vi.clearAllMocks());

test("renders children when hydrated and connected", () => {
  useWallet.mockReturnValue({ hydrated: true, isConnected: true });
  render(<AuthGate><p>gated</p></AuthGate>);
  expect(screen.getByText("gated")).toBeInTheDocument();
  expect(push).not.toHaveBeenCalled();
});

test("waits during hydration: no redirect, no children", () => {
  useWallet.mockReturnValue({ hydrated: false, isConnected: false });
  render(<AuthGate><p>gated</p></AuthGate>);
  expect(screen.queryByText("gated")).not.toBeInTheDocument();
  expect(push).not.toHaveBeenCalled();
});

test("redirects to / when hydrated and disconnected", () => {
  useWallet.mockReturnValue({ hydrated: true, isConnected: false });
  render(<AuthGate><p>gated</p></AuthGate>);
  expect(push).toHaveBeenCalledWith("/");
  expect(screen.queryByText("gated")).not.toBeInTheDocument();
});
