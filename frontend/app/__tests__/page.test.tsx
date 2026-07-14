import { render, screen, waitFor } from "@testing-library/react";
import Landing from "../page";

const replace = vi.fn();
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, push }) }));
const useWallet = vi.fn();
vi.mock("../../hooks/useWallet", () => ({ useWallet: () => useWallet() }));

afterEach(() => vi.clearAllMocks());

test("shows onboarding when hydrated and disconnected", () => {
  useWallet.mockReturnValue({ address: null, hydrated: true, connect: vi.fn() });
  render(<Landing />);
  expect(screen.getByRole("button", { name: "Connect wallet" })).toBeInTheDocument();
  expect(replace).not.toHaveBeenCalled();
});

test("renders nothing and does not forward while hydrating", () => {
  useWallet.mockReturnValue({ address: undefined, hydrated: false, connect: vi.fn() });
  render(<Landing />);
  expect(screen.queryByRole("button", { name: "Connect wallet" })).not.toBeInTheDocument();
  expect(replace).not.toHaveBeenCalled();
});

test("forwards to /home when a session is hydrated", async () => {
  useWallet.mockReturnValue({ address: "GABC123", hydrated: true, connect: vi.fn() });
  render(<Landing />);
  await waitFor(() => expect(replace).toHaveBeenCalledWith("/home"));
  expect(screen.queryByRole("button", { name: "Connect wallet" })).not.toBeInTheDocument();
});
