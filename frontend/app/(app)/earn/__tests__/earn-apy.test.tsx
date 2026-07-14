/**
 * Earn's APY surfaces with the backend **enabled** (R5 · KTD3).
 *
 * The offline half — API unset ⇒ the 8.59%/5.10% fixtures on every surface, zero requests — is what
 * `earn-empty.test.tsx` and the rest of the suite already guard; they all run with the var absent.
 * Here `NEXT_PUBLIC_API_URL` is set in a `vi.hoisted` block (it must land before `lib/api/config.ts` is
 * imported, which reads it at module scope the way Next inlines it).
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockVaultClient } from "@sorosense/vault-client";
import { VaultProvider } from "../../../../providers/VaultProvider";
import { seedVault } from "../../../../lib/vault/seed";
import EarnPage from "../page";

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_API_URL = "http://localhost:8787";
});
afterAll(() => {
  delete process.env.NEXT_PUBLIC_API_URL;
});

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
const useWallet = vi.fn();
vi.mock("../../../../hooks/useWallet", () => ({ useWallet: () => useWallet() }));

/** The backend's USD row: 8.20% — the fixture says 8.59%, so the two are never confusable. */
const USD_ROW = {
  currency: "USD",
  name: "DeFindex USDC vault",
  venue: "DeFindex",
  kind: "vault",
  tags: ["DeFindex", "Vault"],
  apy: 8.2,
  shares: "10240000000",
  value: "11160000000",
  valueUsd: 1116,
  frozen: false,
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify([USD_ROW]), { status: 200, headers: { "content-type": "application/json" } }),
  );
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test("the funded hero shows the backend's rate for USD, not the fixture", async () => {
  const user = userEvent.setup();
  useWallet.mockReturnValue({ address: "GUSER", isConnected: true });
  const client = new MockVaultClient();
  await seedVault(client, "GUSER"); // USD + EUR funded on the seam
  render(
    <VaultProvider client={client}>
      <EarnPage />
    </VaultProvider>,
  );

  await waitFor(() => expect(screen.getByText("Total earned")).toBeInTheDocument());
  // The bucket toggle cycles All buckets → USD bucket (CURRENCIES order).
  await user.click(screen.getByRole("button", { name: "Switch bucket" }));
  await waitFor(() => expect(screen.getByText("USD bucket")).toBeInTheDocument());
  expect(screen.getByText(/8\.20% APY/)).toBeInTheDocument();
  expect(screen.queryByText(/8\.59% APY/)).toBeNull();
});

test("the EUR bucket has no /holdings row (unfunded there) and keeps the fixture rate", async () => {
  const user = userEvent.setup();
  useWallet.mockReturnValue({ address: "GUSER", isConnected: true });
  const client = new MockVaultClient();
  await seedVault(client, "GUSER");
  render(
    <VaultProvider client={client}>
      <EarnPage />
    </VaultProvider>,
  );

  await waitFor(() => expect(screen.getByText("Total earned")).toBeInTheDocument());
  await user.click(screen.getByRole("button", { name: "Switch bucket" })); // USD bucket
  await user.click(screen.getByRole("button", { name: "Switch bucket" })); // EUR bucket
  await waitFor(() => expect(screen.getByText("EUR bucket")).toBeInTheDocument());
  const subline = screen.getByText(/balance · .* APY/).textContent!;
  expect(subline).toMatch(/5\.10% APY/);
  expect(subline).not.toMatch(/NaN|0\.00% APY/);
});

test("the empty-state hero and simulator have no /holdings row either — fixture, never NaN", async () => {
  const user = userEvent.setup();
  // No address ⇒ no depositor to query: the API stays untouched and the fixture rate renders (KTD3).
  useWallet.mockReturnValue({ address: null, isConnected: false });
  render(
    <VaultProvider client={new MockVaultClient()}>
      <EarnPage />
    </VaultProvider>,
  );

  await waitFor(() => expect(screen.getByText("Earn balance")).toBeInTheDocument());
  expect(screen.getByTestId("hero-apy").textContent).toBe("8.59% APY");
  expect(screen.getByTestId("projection").textContent).toBe("$85.90");
  await user.click(screen.getByRole("button", { name: "EUR" }));
  expect(screen.getByTestId("hero-apy").textContent).toBe("5.10% APY");
  expect(fetchMock).not.toHaveBeenCalled();
});

test("a /holdings read that fails degrades the funded hero to the fixture, never a blank", async () => {
  const logged = vi.spyOn(console, "error").mockImplementation(() => {});
  const user = userEvent.setup();
  fetchMock.mockRejectedValue(new TypeError("Failed to fetch")); // backend down mid-demo
  useWallet.mockReturnValue({ address: "GUSER", isConnected: true });
  const client = new MockVaultClient();
  await seedVault(client, "GUSER");
  render(
    <VaultProvider client={client}>
      <EarnPage />
    </VaultProvider>,
  );

  await waitFor(() => expect(screen.getByText("Total earned")).toBeInTheDocument());
  await user.click(screen.getByRole("button", { name: "Switch bucket" }));
  await waitFor(() => expect(screen.getByText("USD bucket")).toBeInTheDocument());
  expect(screen.getByText(/8\.59% APY/)).toBeInTheDocument();
  expect(logged).toHaveBeenCalled();
});
