import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockVaultClient, mockSigner } from "@sorosense/vault-client";
import { VaultProvider } from "../../providers/VaultProvider";
import { useAutoCompound } from "../useAutoCompound";

const useWallet = vi.fn();
vi.mock("../useWallet", () => ({ useWallet: () => useWallet() }));

const ADDRESS = "GUSER";

/** Drives the hook the way the Account surfaces do: a press calls toggle(), errors land in a toast. */
function Probe({ onError }: { onError?: (m: string) => void } = {}) {
  const { loading, enabled, pending, toggle } = useAutoCompound(onError);
  return (
    <>
      <span data-testid="state">{loading ? "loading" : String(enabled)}</span>
      <span data-testid="pending">{String(pending)}</span>
      <button onClick={() => void toggle()}>toggle</button>
    </>
  );
}

function renderProbe(client: MockVaultClient, onError?: (m: string) => void) {
  render(
    <VaultProvider client={client}>
      <Probe onError={onError} />
    </VaultProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useWallet.mockReturnValue({
    address: ADDRESS,
    isConnected: true,
    signTransaction: vi.fn(async (xdr: string) => xdr),
  });
});

test("an unset preference reads ON — the seam's default (unset = enabled)", async () => {
  renderProbe(new MockVaultClient());
  await waitFor(() => expect(screen.getByTestId("state").textContent).toBe("true"));
});

test("toggling OFF writes setAutoCompound(address, false) through the seam", async () => {
  const user = userEvent.setup();
  const client = new MockVaultClient();
  const setAutoCompound = vi.spyOn(client, "setAutoCompound");
  renderProbe(client);
  await waitFor(() => expect(screen.getByTestId("state").textContent).toBe("true"));

  await user.click(screen.getByRole("button", { name: "toggle" }));

  await waitFor(() => expect(screen.getByTestId("state").textContent).toBe("false"));
  expect(setAutoCompound).toHaveBeenCalledWith(ADDRESS, false);
  // The write really landed on the seam, not just in React state.
  await expect(client.autoCompoundEnabled(ADDRESS)).resolves.toBe(false);
  expect(screen.getByTestId("pending").textContent).toBe("false");
});

test("R2 — it is revocable: OFF then ON round-trips", async () => {
  const user = userEvent.setup();
  const client = new MockVaultClient();
  renderProbe(client);
  await waitFor(() => expect(screen.getByTestId("state").textContent).toBe("true"));

  await user.click(screen.getByRole("button", { name: "toggle" }));
  await waitFor(() => expect(screen.getByTestId("state").textContent).toBe("false"));

  await user.click(screen.getByRole("button", { name: "toggle" }));
  await waitFor(() => expect(screen.getByTestId("state").textContent).toBe("true"));
  await expect(client.autoCompoundEnabled(ADDRESS)).resolves.toBe(true);
});

test("R1 — toggling never touches the safety mandate: hasConsent is unchanged, setPolicyConsent never called", async () => {
  const user = userEvent.setup();
  const client = new MockVaultClient();
  await client.setPolicyConsent(ADDRESS).signAndSubmit(mockSigner("depositor", ADDRESS));
  const setPolicyConsent = vi.spyOn(client, "setPolicyConsent");
  renderProbe(client);
  await waitFor(() => expect(screen.getByTestId("state").textContent).toBe("true"));

  await user.click(screen.getByRole("button", { name: "toggle" })); // OFF
  await waitFor(() => expect(screen.getByTestId("state").textContent).toBe("false"));
  await expect(client.hasConsent(ADDRESS)).resolves.toBe(true);

  await user.click(screen.getByRole("button", { name: "toggle" })); // back ON
  await waitFor(() => expect(screen.getByTestId("state").textContent).toBe("true"));
  await expect(client.hasConsent(ADDRESS)).resolves.toBe(true);

  // KTD3: the mandate is granted once, in the deposit flow. This surface must never write it.
  expect(setPolicyConsent).not.toHaveBeenCalled();
});

test("a declined signature leaves the switch in its prior position and surfaces a toast", async () => {
  const user = userEvent.setup();
  const onError = vi.fn();
  useWallet.mockReturnValue({
    address: ADDRESS,
    isConnected: true,
    signTransaction: vi.fn().mockRejectedValue({ code: -1, message: "The user closed the modal." }),
  });
  const client = new MockVaultClient();
  renderProbe(client, onError);
  await waitFor(() => expect(screen.getByTestId("state").textContent).toBe("true"));

  await user.click(screen.getByRole("button", { name: "toggle" }));

  await waitFor(() => expect(onError).toHaveBeenCalledWith("Signature cancelled. Nothing changed."));
  expect(screen.getByTestId("state").textContent).toBe("true"); // never moved
  await expect(client.autoCompoundEnabled(ADDRESS)).resolves.toBe(true); // nothing written
});

test("a failed write (not a cancellation) toasts the wallet's message", async () => {
  const user = userEvent.setup();
  const onError = vi.fn();
  useWallet.mockReturnValue({
    address: ADDRESS,
    isConnected: true,
    signTransaction: vi.fn().mockRejectedValue(new Error("network down")),
  });
  renderProbe(new MockVaultClient(), onError);
  await waitFor(() => expect(screen.getByTestId("state").textContent).toBe("true"));

  await user.click(screen.getByRole("button", { name: "toggle" }));

  await waitFor(() => expect(onError).toHaveBeenCalledWith("network down"));
  expect(screen.getByTestId("state").textContent).toBe("true");
});

test("KTD4 fail-open — a rejected read renders ON and logs, never Off", async () => {
  // Fail-closed here would misreport a user whose preference is actually ON (the seam's default) and
  // invite a pointless write. The error is logged, not swallowed — spy so it isn't test-run noise.
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  const client = new MockVaultClient();
  const error = new Error("network down");
  vi.spyOn(client, "autoCompoundEnabled").mockRejectedValue(error);

  renderProbe(client);

  await waitFor(() => expect(screen.getByTestId("state").textContent).toBe("true"));
  expect(consoleError).toHaveBeenCalledWith(expect.stringContaining("autoCompoundEnabled"), error);
  consoleError.mockRestore();
});

test("no wallet connected — the hook settles without throwing and toggle() is inert", async () => {
  const user = userEvent.setup();
  const client = new MockVaultClient();
  const setAutoCompound = vi.spyOn(client, "setAutoCompound");
  useWallet.mockReturnValue({ address: null, isConnected: false, signTransaction: vi.fn() });

  renderProbe(client);

  await waitFor(() => expect(screen.getByTestId("state").textContent).toBe("true"));
  await user.click(screen.getByRole("button", { name: "toggle" }));
  expect(setAutoCompound).not.toHaveBeenCalled();
});
