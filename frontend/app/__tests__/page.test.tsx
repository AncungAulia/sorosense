import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import Landing from "../page";

const replace = vi.fn();
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, push }) }));
const useWallet = vi.fn();
vi.mock("../../hooks/useWallet", () => ({ useWallet: () => useWallet() }));

afterEach(() => vi.clearAllMocks());

beforeEach(() => localStorage.clear());

test("shows onboarding when hydrated and disconnected for a new user", async () => {
  useWallet.mockReturnValue({ address: null, hydrated: true, connect: vi.fn() });
  render(<Landing />);
  expect(await screen.findByRole("button", { name: "Next" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Connect wallet" })).not.toBeInTheDocument();
  expect(replace).not.toHaveBeenCalled();
});

test("renders nothing and does not forward while hydrating", () => {
  useWallet.mockReturnValue({ address: undefined, hydrated: false, connect: vi.fn() });
  render(<Landing />);
  expect(screen.getByLabelText("Loading SoroSense")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Connect wallet" })).not.toBeInTheDocument();
  expect(replace).not.toHaveBeenCalled();
});

test("shows connect screen when onboarding was already completed", async () => {
  localStorage.setItem("soro.onboarding.done", "1");
  useWallet.mockReturnValue({ address: null, hydrated: true, connect: vi.fn() });
  render(<Landing />);
  expect(await screen.findByRole("button", { name: "Connect wallet" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Next" })).not.toBeInTheDocument();
});

test("skip jumps to connect screen and back returns to onboarding", async () => {
  useWallet.mockReturnValue({ address: null, hydrated: true, connect: vi.fn() });
  render(<Landing />);
  fireEvent.click(await screen.findByRole("button", { name: "Skip" }));
  expect(await screen.findByRole("button", { name: "Connect wallet" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Back" }));
  expect(await screen.findByRole("button", { name: "Next" })).toBeInTheDocument();
});

test("forwards to /home when a session is hydrated", async () => {
  useWallet.mockReturnValue({ address: "GABC123", hydrated: true, connect: vi.fn() });
  render(<Landing />);
  await waitFor(() => expect(replace).toHaveBeenCalledWith("/home"));
  expect(screen.queryByRole("button", { name: "Connect wallet" })).not.toBeInTheDocument();
});
