import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockVaultClient } from "@sorosense/vault-client";
import { VaultProvider } from "../../../providers/VaultProvider";
import { ToastProvider } from "../../../providers/ToastProvider";
import { DepositKeypad } from "../DepositKeypad";

const USDC_ISSUER = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
const ADDRESS = "GDUY7J7A33TQWOSOQGDO776GGLM3UQERL4J3SPT56F6YS4ID7MLDERI4";

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_API_URL = "http://localhost:8787";
  process.env.NEXT_PUBLIC_STELLAR_HORIZON_URL = "https://horizon-testnet.stellar.org";
  process.env.NEXT_PUBLIC_USDC_ISSUER = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
  process.env.NEXT_PUBLIC_EURC_ISSUER = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";
});

afterAll(() => {
  delete process.env.NEXT_PUBLIC_API_URL;
  delete process.env.NEXT_PUBLIC_STELLAR_HORIZON_URL;
  delete process.env.NEXT_PUBLIC_USDC_ISSUER;
  delete process.env.NEXT_PUBLIC_EURC_ISSUER;
});

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), back: vi.fn() }) }));
const useWallet = vi.fn();
vi.mock("../../../hooks/useWallet", () => ({ useWallet: () => useWallet() }));

const USDC_LINE = (balance: string) => ({
  balance,
  asset_type: "credit_alphanum4",
  asset_code: "USDC",
  asset_issuer: USDC_ISSUER,
});
const XLM_LINE = { balance: "9999.9999900", asset_type: "native" };

function account(balances: unknown[]): Response {
  return new Response(JSON.stringify({ account_id: ADDRESS, balances }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

let fetchMock: ReturnType<typeof vi.fn>;

function route(handlers: { horizon: () => Response }) {
  fetchMock.mockImplementation((url: string) =>
    Promise.resolve(String(url).includes("/accounts/") ? handlers.horizon() : new Response("not found", { status: 404 })),
  );
}

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  useWallet.mockReturnValue({
    address: ADDRESS,
    isConnected: true,
    signTransaction: vi.fn(async (xdr: string) => `sig:${xdr}`),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function setup() {
  render(
    <VaultProvider client={new MockVaultClient()}>
      <ToastProvider>
        <DepositKeypad sym="usdc" />
      </ToastProvider>
    </VaultProvider>,
  );
  return userEvent.setup();
}

test("a Horizon account holding 250 USDC renders 250.00 and drives the quick-fills off that number", async () => {
  route({ horizon: () => account([XLM_LINE, USDC_LINE("250.0000000")]) });
  const user = setup();

  await waitFor(() => expect(screen.getByText("$250.00")).toBeInTheDocument());
  expect(screen.queryByText("$9,076.00")).toBeNull();

  await user.click(screen.getByRole("button", { name: "Max" }));
  expect(screen.getByTestId("keypad-value").textContent).toBe("250.00");
  await user.click(screen.getByRole("button", { name: "10%" }));
  expect(screen.getByTestId("keypad-value").textContent).toBe("25.00");
});

test("no USDC trustline renders a zero balance without the account faucet", async () => {
  route({ horizon: () => account([XLM_LINE]) });
  setup();

  await waitFor(() => expect(screen.getByText("$0.00")).toBeInTheDocument());
  expect(screen.queryByRole("button", { name: /Get test USDC|Mint/ })).toBeNull();
});

test("an unfunded account (Horizon 404) renders zero and does not throw", async () => {
  fetchMock.mockResolvedValue(new Response("{}", { status: 404 }));
  setup();

  await waitFor(() => expect(screen.getByText("$0.00")).toBeInTheDocument());
  expect(screen.getByRole("button", { name: "Deposit fund" })).toBeDisabled();
});

test("a Horizon that fails falls back to ZERO, never to the fixture", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
  setup();

  await waitFor(() => expect(screen.getByText("$0.00")).toBeInTheDocument());
  expect(screen.queryByText("$9,076.00")).toBeNull();
  expect(screen.getByRole("button", { name: "Deposit fund" })).toBeDisabled();
});
