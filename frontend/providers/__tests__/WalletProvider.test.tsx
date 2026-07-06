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
  const { address, isConnected, connect } = useWallet();
  return (
    <div>
      <span data-testid="addr">{address ?? "none"}</span>
      <span data-testid="flag">{String(isConnected)}</span>
      <button onClick={() => connect()}>connect</button>
    </div>
  );
}

test("connect sets address + isConnected", async () => {
  render(<WalletProvider><Probe /></WalletProvider>);
  expect(screen.getByTestId("flag").textContent).toBe("false");
  await userEvent.click(screen.getByRole("button", { name: "connect" }));
  expect(await screen.findByText("GABC123")).toBeInTheDocument();
  expect(screen.getByTestId("flag").textContent).toBe("true");
});
