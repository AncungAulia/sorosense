import { render, screen } from "@testing-library/react";
import { AuthGate } from "../AuthGate";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
const useWallet = vi.fn();
vi.mock("../../hooks/useWallet", () => ({ useWallet: () => useWallet() }));

test("renders children when connected", () => {
  useWallet.mockReturnValue({ isConnected: true });
  render(<AuthGate><p>gated</p></AuthGate>);
  expect(screen.getByText("gated")).toBeInTheDocument();
});

test("redirects to / when not connected", () => {
  useWallet.mockReturnValue({ isConnected: false });
  render(<AuthGate><p>gated</p></AuthGate>);
  expect(push).toHaveBeenCalledWith("/");
});
