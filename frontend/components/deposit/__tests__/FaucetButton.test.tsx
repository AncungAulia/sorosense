/**
 * The faucet button (R6 · STE-46) with the backend **enabled** — `NEXT_PUBLIC_API_URL` is set in a
 * `vi.hoisted` block so `lib/api/config.ts` sees it at module scope, the way Next inlines it.
 *
 * The API-disabled case (the button must not exist at all) is asserted in `DepositKeypad.test.tsx` and
 * `AddFundsDrawer.test.tsx`, which run with the var absent like the rest of the suite.
 *
 * `changeTrust` is the one module mocked: it builds a real Stellar XDR, loads the source account from
 * Horizon and submits over the SDK's own transport — none of which a jsdom `fetch` spy can observe. The
 * *contract with the backend* (the request body, the retry count) is asserted at the wire, not stubbed.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "../../../providers/ToastProvider";
import { FaucetButton } from "../FaucetButton";
import { addTrustline } from "../../../lib/wallet/changeTrust";

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

vi.mock("../../../lib/wallet/changeTrust", () => ({ addTrustline: vi.fn() }));
const trustline = vi.mocked(addTrustline);

const useWallet = vi.fn();
vi.mock("../../../hooks/useWallet", () => ({ useWallet: () => useWallet() }));

const ADDRESS = "GDUY7J7A33TQWOSOQGDO776GGLM3UQERL4J3SPT56F6YS4ID7MLDERI4";

const MINTED = { ok: true, hash: "b0b0…", currency: "USD", amount: "10000000000" };
const NEEDS_TRUSTLINE = {
  needsChangeTrust: true,
  currency: "USD",
  sac: "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
  message: "add a trustline, then retry",
};

let fetchMock: ReturnType<typeof vi.fn>;
let sign: ReturnType<typeof vi.fn>;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  sign = vi.fn(async (xdr: string) => `signed:${xdr}`);
  useWallet.mockReturnValue({ address: ADDRESS, isConnected: true, signTransaction: sign });
  trustline.mockReset();
  trustline.mockResolvedValue("trustline-hash");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function setup(currency: "USD" | "EUR" | "MXN" = "USD") {
  const onMinted = vi.fn();
  render(
    <ToastProvider>
      <FaucetButton currency={currency} onMinted={onMinted} />
    </ToastProvider>,
  );
  return { onMinted, user: userEvent.setup() };
}

/** Every `POST /faucet` call the component made, decoded. */
function faucetCalls(): { url: string; body: unknown }[] {
  return fetchMock.mock.calls
    .map(([url, init]) => ({ url: String(url), init: init as RequestInit }))
    .filter((c) => c.url.endsWith("/faucet"))
    .map((c) => ({ url: c.url, body: JSON.parse(String(c.init.body)) as unknown }));
}

test("secret hygiene — the request body is exactly { address, currency }, and nothing else", async () => {
  fetchMock.mockResolvedValue(json(MINTED));
  const { user } = setup("USD");

  await user.click(screen.getByRole("button", { name: "Get test USDC" }));

  await waitFor(() => expect(faucetCalls()).toHaveLength(1));
  const [call] = faucetCalls();
  expect(call!.body).toEqual({ address: ADDRESS, currency: "USD" });
  // No amount the client picked, no key, no extra field a future refactor smuggled in.
  expect(Object.keys(call!.body as object).sort()).toEqual(["address", "currency"]);
  const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
  expect(init.method).toBe("POST");
  expect(JSON.stringify(init.body)).not.toMatch(/secret|seed|S[A-Z2-7]{55}/i);
});

test("a 200 mint toasts success and asks the caller to re-read the balance", async () => {
  fetchMock.mockResolvedValue(json(MINTED));
  const { user, onMinted } = setup("USD");

  await user.click(screen.getByRole("button", { name: "Get test USDC" }));

  await waitFor(() => expect(screen.getByText(/Test USDC on the way/)).toBeInTheDocument());
  expect(onMinted).toHaveBeenCalledTimes(1);
  expect(trustline).not.toHaveBeenCalled();
});

test("a 409 signs a changeTrust, then retries the mint EXACTLY once", async () => {
  fetchMock
    .mockResolvedValueOnce(json(NEEDS_TRUSTLINE, 409))
    .mockResolvedValueOnce(json(MINTED));
  const { user, onMinted } = setup("USD");

  await user.click(screen.getByRole("button", { name: "Get test USDC" }));

  await waitFor(() => expect(onMinted).toHaveBeenCalledTimes(1));
  expect(trustline).toHaveBeenCalledTimes(1);
  expect(trustline).toHaveBeenCalledWith("USDC", ADDRESS, sign);
  // The retry is bounded: two mint attempts, never a loop against a rate-limited endpoint.
  expect(faucetCalls()).toHaveLength(2);
  expect(screen.getByText(/Test USDC on the way/)).toBeInTheDocument();
});

test("a declined changeTrust signature toasts and attempts NO mint", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  fetchMock.mockResolvedValueOnce(json(NEEDS_TRUSTLINE, 409));
  trustline.mockRejectedValue(new Error("User declined the request"));
  const { user, onMinted } = setup("USD");

  await user.click(screen.getByRole("button", { name: "Get test USDC" }));

  await waitFor(() => expect(screen.getByText(/Trustline not added/)).toBeInTheDocument());
  expect(faucetCalls()).toHaveLength(1); // the first attempt only — no retry
  expect(onMinted).not.toHaveBeenCalled();
});

test("a 429 toasts the rate limit and does not retry", async () => {
  fetchMock.mockResolvedValue(json({ error: { message: "rate limited: try again later" } }, 429));
  const { user, onMinted } = setup("USD");

  await user.click(screen.getByRole("button", { name: "Get test USDC" }));

  await waitFor(() => expect(screen.getByText(/rate-limited/i)).toBeInTheDocument());
  expect(faucetCalls()).toHaveLength(1);
  expect(trustline).not.toHaveBeenCalled();
  expect(onMinted).not.toHaveBeenCalled();
});

test("a 404 (no faucet mounted on this backend) says so, then removes the dead control", async () => {
  fetchMock.mockResolvedValue(new Response("404 Not Found", { status: 404 }));
  const { user } = setup("USD");

  await user.click(screen.getByRole("button", { name: "Get test USDC" }));

  // Not a control that silently vanishes under the user's finger: it explains itself first.
  await waitFor(() => expect(screen.getByText(/no faucet/i)).toBeInTheDocument());
  expect(screen.queryByRole("button", { name: /Get test/ })).toBeNull();
});

test("the button is absent for a currency the faucet does not mint (MXN)", () => {
  setup("MXN");
  expect(screen.queryByRole("button", { name: /Get test/ })).toBeNull();
  expect(fetchMock).not.toHaveBeenCalled();
});

test("the button is absent with no wallet connected", () => {
  useWallet.mockReturnValue({ address: null, isConnected: false, signTransaction: sign });
  setup("USD");
  expect(screen.queryByRole("button", { name: /Get test/ })).toBeNull();
});

test("no risk label, tier, or score appears on the control", async () => {
  fetchMock.mockResolvedValue(json(MINTED));
  setup("EUR");
  expect(screen.getByRole("button", { name: "Get test EURC" })).toBeInTheDocument();
  expect(document.body.textContent).not.toMatch(/\b(risk|tier|score|safe|watch)\b/i);
});
