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

test("a read that fails AFTER a successful revoke keeps OFF — fail-open never discards a known answer", async () => {
  // The write is followed by bump(), which re-reads. If that re-read flakes, falling back to the
  // seam's ON default would snap the switch back to On while the chain says Off — a lie about the
  // user's funds. Fail-open means "ON when nothing is known", not "ON whenever a read fails".
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  const user = userEvent.setup();
  const client = new MockVaultClient();
  renderProbe(client);
  await waitFor(() => expect(screen.getByTestId("state").textContent).toBe("true"));

  // Installed only now, so a call to it can only be the re-read the write's bump() triggers — this
  // also pins bump() itself: drop it and the spy is never called, failing the waitFor below.
  const read = vi.spyOn(client, "autoCompoundEnabled").mockRejectedValue(new Error("network down"));
  await user.click(screen.getByRole("button", { name: "toggle" }));

  await waitFor(() => expect(read).toHaveBeenCalled()); // the post-bump re-read fired and rejected
  expect(screen.getByTestId("state").textContent).toBe("false"); // and did not clobber the write
  consoleError.mockRestore();
});

test("a double-press fires exactly one transaction and the switch is pending in between", async () => {
  const user = userEvent.setup();
  let release!: (xdr: string) => void;
  useWallet.mockReturnValue({
    address: ADDRESS,
    isConnected: true,
    signTransaction: vi.fn(() => new Promise<string>((resolve) => { release = resolve; })),
  });
  const client = new MockVaultClient();
  const setAutoCompound = vi.spyOn(client, "setAutoCompound");
  renderProbe(client);
  await waitFor(() => expect(screen.getByTestId("state").textContent).toBe("true"));

  const button = screen.getByRole("button", { name: "toggle" });
  await user.click(button);
  await waitFor(() => expect(screen.getByTestId("pending").textContent).toBe("true"));
  await user.click(button); // second press while the signature is still open

  release("signed");
  await waitFor(() => expect(screen.getByTestId("state").textContent).toBe("false"));
  expect(setAutoCompound).toHaveBeenCalledTimes(1); // never two transactions
});

test("a submitted-but-rejected transaction does not move the switch", async () => {
  // The seam reports an on-chain rejection as `success: false` rather than throwing, so a resolved
  // promise is not proof the write landed.
  const user = userEvent.setup();
  const onError = vi.fn();
  const client = new MockVaultClient();
  vi.spyOn(client, "setAutoCompound").mockReturnValue({
    xdr: "mock-xdr-rejected",
    requiredSigner: "depositor",
    signAndSubmit: async () => ({ hash: "mock-tx-rejected", success: false }),
  });
  renderProbe(client, onError);
  await waitFor(() => expect(screen.getByTestId("state").textContent).toBe("true"));

  await user.click(screen.getByRole("button", { name: "toggle" }));

  await waitFor(() => expect(onError).toHaveBeenCalledWith("Could not save that. Nothing changed."));
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
