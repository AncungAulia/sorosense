import { render, screen, waitFor } from "@testing-library/react";
import { MockVaultClient, mockSigner } from "@sorosense/vault-client";
import { VaultProvider } from "../../providers/VaultProvider";
import { useConsent } from "../useConsent";

const useWallet = vi.fn();
vi.mock("../useWallet", () => ({ useWallet: () => useWallet() }));

function Probe() {
  const { loading, enabled } = useConsent();
  return <span data-testid="state">{loading ? "loading" : String(enabled)}</span>;
}

test("reads consent from the seam", async () => {
  useWallet.mockReturnValue({ address: "GUSER", isConnected: true });
  const client = new MockVaultClient();
  await client.setPolicyConsent("GUSER").signAndSubmit(mockSigner("depositor", "GUSER"));
  render(<VaultProvider client={client}><Probe /></VaultProvider>);
  await waitFor(() => expect(screen.getByTestId("state").textContent).toBe("true"));
});

test("a fresh user has not consented", async () => {
  useWallet.mockReturnValue({ address: "GUSER", isConnected: true });
  render(<VaultProvider client={new MockVaultClient()}><Probe /></VaultProvider>);
  await waitFor(() => expect(screen.getByTestId("state").textContent).toBe("false"));
});

test("fail-closed — a rejected read renders Off, never an optimistic On", async () => {
  // The hook logs the error it fails closed on (STE-26 review) — spy so the expected log doesn't
  // surface as noise in the test run, and assert it fired instead of just swallowing it.
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  useWallet.mockReturnValue({ address: "GUSER", isConnected: true });
  const client = new MockVaultClient();
  const error = new Error("network down");
  vi.spyOn(client, "hasConsent").mockRejectedValue(error);
  render(<VaultProvider client={client}><Probe /></VaultProvider>);
  await waitFor(() => expect(screen.getByTestId("state").textContent).toBe("false"));
  expect(consoleError).toHaveBeenCalledWith(expect.stringContaining("hasConsent"), error);
  consoleError.mockRestore();
});
