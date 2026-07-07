import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import Landing from "../page";
import { WalletError, USER_CLOSED_MODAL } from "../../lib/wallet-error";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
const connect = vi.fn();
vi.mock("../../hooks/useWallet", () => ({ useWallet: () => ({ connect }) }));

beforeEach(() => {
  push.mockReset();
  connect.mockReset();
});

test("navigates to /home after a successful connect", async () => {
  connect.mockResolvedValue(undefined);
  render(<Landing />);
  fireEvent.click(screen.getByText("Connect wallet"));
  await waitFor(() => expect(push).toHaveBeenCalledWith("/home"));
});

test("surfaces a readable message on failure — no [object Object], no navigation", async () => {
  connect.mockRejectedValue(new WalletError("Freighter is locked", 5));
  render(<Landing />);
  fireEvent.click(screen.getByText("Connect wallet"));
  expect(await screen.findByText("Freighter is locked")).toBeInTheDocument();
  expect(push).not.toHaveBeenCalled();
});

test("stays silent when the user just closes the wallet picker", async () => {
  connect.mockRejectedValue(new WalletError("The user closed the modal.", USER_CLOSED_MODAL));
  render(<Landing />);
  fireEvent.click(screen.getByText("Connect wallet"));
  await waitFor(() => expect(connect).toHaveBeenCalled());
  expect(push).not.toHaveBeenCalled();
  expect(screen.queryByText("The user closed the modal.")).not.toBeInTheDocument();
});
