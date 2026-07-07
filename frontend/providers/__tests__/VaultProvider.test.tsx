import { render, screen, waitFor } from "@testing-library/react";
import { MockVaultClient } from "@sorosense/vault-client";
import { VaultProvider } from "../VaultProvider";
import { useVault } from "../../hooks/useVault";

const useWallet = vi.fn();
vi.mock("../../hooks/useWallet", () => ({ useWallet: () => useWallet() }));

function Probe() {
  const { client } = useVault();
  return <span>client:{client ? "yes" : "no"}</span>;
}

test("provides an injected client and seeds it when connected", async () => {
  useWallet.mockReturnValue({ address: "GUSER" });
  const client = new MockVaultClient();
  render(<VaultProvider client={client}><Probe /></VaultProvider>);
  expect(screen.getByText("client:yes")).toBeInTheDocument();
  await waitFor(async () => expect(await client.balanceOf("GUSER", "USD")).toBeGreaterThan(0n));
});
