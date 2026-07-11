import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WalletProvider } from "../WalletProvider";
import { useWallet } from "../../hooks/useWallet";
import * as wallet from "../../lib/wallet";

// One canonical live address: getAddress() (the re-verification read) returns the SAME address
// connect() hands back, i.e. "the live wallet is the one you connected". The mismatch/locked tests
// override getAddress per-case to a different value or a throw; everything else restores cleanly.
vi.mock("../../lib/wallet", () => ({
  connect: vi.fn(async () => ({ address: "GABC123", name: "Freighter" })),
  disconnect: vi.fn(async () => {}),
  signTransaction: vi.fn(async () => "SIGNED"),
  getAddress: vi.fn(async () => "GABC123"),
}));

function Probe() {
  const { address, walletName, hydrated, isConnected, connect, disconnect } = useWallet();
  return (
    <div>
      <span data-testid="addr">{address ?? "none"}</span>
      <span data-testid="walletName">{walletName ?? ""}</span>
      <span data-testid="hydrated">{String(hydrated)}</span>
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
  expect(await screen.findByText("none")).toBeInTheDocument(); // hydrated, no session
  await userEvent.click(screen.getByRole("button", { name: "connect" }));
  expect(await screen.findByText("GABC123")).toBeInTheDocument();
  expect(screen.getByTestId("flag").textContent).toBe("true");
});

test("hydration with no stored session ends disconnected but hydrated", async () => {
  render(<WalletProvider><Probe /></WalletProvider>);
  await waitFor(() => expect(screen.getByTestId("hydrated").textContent).toBe("true"));
  expect(screen.getByTestId("addr").textContent).toBe("none");
  expect(screen.getByTestId("flag").textContent).toBe("false");
});

test("restores a stored session only after getAddress() confirms it", async () => {
  localStorage.setItem("soro.wallet", "GABC123");
  localStorage.setItem("soro.wallet.name", "Freighter");
  render(<WalletProvider><Probe /></WalletProvider>);
  expect(await screen.findByText("GABC123")).toBeInTheDocument();
  expect(screen.getByTestId("flag").textContent).toBe("true");
  expect(screen.getByTestId("walletName").textContent).toBe("Freighter");
  expect(wallet.getAddress).toHaveBeenCalledTimes(1);
});

test("clears a stale session when getAddress() disagrees", async () => {
  vi.mocked(wallet.getAddress).mockResolvedValueOnce("GDIFFERENT");
  localStorage.setItem("soro.wallet", "GABC123");
  localStorage.setItem("soro.wallet.name", "Freighter");
  render(<WalletProvider><Probe /></WalletProvider>);
  await waitFor(() => expect(screen.getByTestId("hydrated").textContent).toBe("true"));
  expect(screen.getByTestId("addr").textContent).toBe("none");
  expect(screen.getByTestId("flag").textContent).toBe("false");
  expect(localStorage.getItem("soro.wallet")).toBeNull();
  expect(localStorage.getItem("soro.wallet.name")).toBeNull();
});

test("clears a stored session when the wallet is locked (getAddress throws)", async () => {
  vi.mocked(wallet.getAddress).mockRejectedValueOnce(new Error("locked"));
  localStorage.setItem("soro.wallet", "GABC123");
  render(<WalletProvider><Probe /></WalletProvider>);
  await waitFor(() => expect(screen.getByTestId("hydrated").textContent).toBe("true"));
  expect(screen.getByTestId("addr").textContent).toBe("none");
  expect(localStorage.getItem("soro.wallet")).toBeNull();
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
  expect(localStorage.getItem("soro.wallet.name")).toBeNull();
});

test("exposes and persists the wallet name across a remount", async () => {
  const user = userEvent.setup();
  const { unmount } = render(<WalletProvider><Probe /></WalletProvider>);
  await user.click(screen.getByText("connect"));
  await waitFor(() => expect(screen.getByTestId("walletName").textContent).toBe("Freighter"));
  unmount();
  render(<WalletProvider><Probe /></WalletProvider>);
  await waitFor(() => expect(screen.getByTestId("walletName").textContent).toBe("Freighter"));
});
