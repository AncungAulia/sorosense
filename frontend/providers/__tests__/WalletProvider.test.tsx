import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WalletProvider } from "../WalletProvider";
import { useWallet } from "../../hooks/useWallet";

vi.mock("../../lib/wallet", () => ({
  connect: vi.fn(async () => "GABC123"),
  disconnect: vi.fn(async () => {}),
  signTransaction: vi.fn(async () => "SIGNED"),
}));

function Probe() {
  const { address, isConnected, connect, disconnect } = useWallet();
  return (
    <div>
      <span data-testid="addr">{address ?? "none"}</span>
      <span data-testid="flag">{String(isConnected)}</span>
      <button onClick={() => connect()}>connect</button>
      <button onClick={() => disconnect()}>disconnect</button>
    </div>
  );
}

afterEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

test("connect sets address + isConnected", async () => {
  render(<WalletProvider><Probe /></WalletProvider>);
  expect(screen.getByTestId("flag").textContent).toBe("false");
  await userEvent.click(screen.getByRole("button", { name: "connect" }));
  expect(await screen.findByText("GABC123")).toBeInTheDocument();
  expect(screen.getByTestId("flag").textContent).toBe("true");
});

test("restores address from localStorage on mount", async () => {
  localStorage.setItem("soro.wallet", "GXYZ789");
  render(<WalletProvider><Probe /></WalletProvider>);
  expect(await screen.findByText("GXYZ789")).toBeInTheDocument();
  expect(screen.getByTestId("flag").textContent).toBe("true");
});

test("disconnect clears address + isConnected + localStorage", async () => {
  render(<WalletProvider><Probe /></WalletProvider>);
  await userEvent.click(screen.getByRole("button", { name: "connect" }));
  expect(await screen.findByText("GABC123")).toBeInTheDocument();
  expect(localStorage.getItem("soro.wallet")).toBe("GABC123");

  await userEvent.click(screen.getByRole("button", { name: "disconnect" }));
  expect(await screen.findByText("none")).toBeInTheDocument();
  expect(screen.getByTestId("flag").textContent).toBe("false");
  expect(localStorage.getItem("soro.wallet")).toBeNull();
});
