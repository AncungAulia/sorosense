import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "../../../providers/ToastProvider";
import { FaucetSection } from "../FaucetSection";

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

const ADDRESS = "GDUY7J7A33TQWOSOQGDO776GGLM3UQERL4J3SPT56F6YS4ID7MLDERI4";
const signTransaction = vi.fn(async (xdr: string) => `signed:${xdr}`);

vi.mock("../../../hooks/useWallet", () => ({
  useWallet: () => ({ address: ADDRESS, isConnected: true, signTransaction }),
}));

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

test("renders USDC and EURC faucet rows with compact mint buttons", async () => {
  localStorage.clear();
  const fetchMock = vi.fn().mockResolvedValue(json({ ok: true, hash: "hash", currency: "USD", amount: "10000000000" }));
  vi.stubGlobal("fetch", fetchMock);

  render(
    <ToastProvider>
      <FaucetSection />
    </ToastProvider>,
  );

  expect(screen.getByText("Faucet")).toBeInTheDocument();
  expect(screen.getByText("USDC")).toBeInTheDocument();
  expect(screen.getByText("EURC")).toBeInTheDocument();
  expect(screen.getByText("Mint test USDC")).toBeInTheDocument();
  expect(screen.getByText("Mint test EURC")).toBeInTheDocument();
  expect(screen.getAllByRole("button", { name: "Mint" })).toHaveLength(2);

  await userEvent.setup().click(screen.getAllByRole("button", { name: "Mint" })[0]!);

  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
  expect(JSON.parse(String(init.body))).toEqual({ address: ADDRESS, currency: "USD" });
  vi.unstubAllGlobals();
});

test("cooldown is scoped per asset, not just per wallet", async () => {
  localStorage.clear();
  const fetchMock = vi.fn().mockResolvedValue(json({ ok: true, hash: "hash", currency: "USD", amount: "10000000000" }));
  vi.stubGlobal("fetch", fetchMock);

  render(
    <ToastProvider>
      <FaucetSection />
    </ToastProvider>,
  );

  const buttons = screen.getAllByRole("button", { name: "Mint" });
  await userEvent.setup().click(buttons[0]!);

  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(buttons[0]).toHaveTextContent(/\d{2}:\d{2}:\d{2}/));
  expect(buttons[1]).toHaveTextContent("Mint");
  expect(buttons[1]).toBeEnabled();
  vi.unstubAllGlobals();
});
