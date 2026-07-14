/**
 * The Horizon trustline read (R6 · A2), driven by a **recorded Horizon response body** — the real
 * derivation, not a stub of our own function.
 *
 * `balance.ts` reads its env at module scope (Next inlines `NEXT_PUBLIC_*` at build time), so each case
 * re-imports the module under a stubbed env. The first case is the offline guarantee: with no Horizon
 * configured, nothing is fetched at all.
 */
import { afterEach, beforeEach, expect, it, describe, vi } from "vitest";

const HORIZON = "https://horizon-testnet.stellar.org";
const USDC_ISSUER = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
const EURC_ISSUER = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";
const ADDRESS = "GDUY7J7A33TQWOSOQGDO776GGLM3UQERL4J3SPT56F6YS4ID7MLDERI4";

let fetchMock: ReturnType<typeof vi.fn>;

/** Import `balance.ts` fresh under a given env. Omit `horizon` to leave the module unconfigured. */
async function loadBalance(env: { horizon?: string; usdc?: string; eurc?: string } = {}) {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_STELLAR_HORIZON_URL", env.horizon ?? "");
  vi.stubEnv("NEXT_PUBLIC_USDC_ISSUER", env.usdc ?? "");
  vi.stubEnv("NEXT_PUBLIC_EURC_ISSUER", env.eurc ?? "");
  return import("../balance");
}

const live = { horizon: HORIZON, usdc: USDC_ISSUER, eurc: EURC_ISSUER };

/** A real-shaped `GET /accounts/{id}` body (trimmed to the fields the read touches). */
function accountResponse(balances: unknown[], status = 200): Response {
  return new Response(JSON.stringify({ account_id: ADDRESS, balances }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const USDC_LINE = {
  balance: "250.0000000",
  limit: "922337203685.4775807",
  asset_type: "credit_alphanum4",
  asset_code: "USDC",
  asset_issuer: USDC_ISSUER,
};
const XLM_LINE = { balance: "9999.9999900", asset_type: "native" };

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("the env gate", () => {
  it("is off with no Horizon URL, and never touches fetch", async () => {
    const { balanceEnabled, readWalletBalance } = await loadBalance();

    expect(balanceEnabled("USDC")).toBe(false);
    const result = await readWalletBalance("USDC", ADDRESS);

    expect(result.ok).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(0); // the offline guarantee
  });

  it("is off for a symbol whose issuer is unset, even when Horizon is configured", async () => {
    const { balanceEnabled } = await loadBalance({ horizon: HORIZON, usdc: USDC_ISSUER });

    expect(balanceEnabled("USDC")).toBe(true);
    expect(balanceEnabled("EURC")).toBe(false);
    // CETES/MXN has no self-issued testnet asset in the demo — it is never live.
    expect(balanceEnabled("CETES")).toBe(false);
  });
});

describe("reading the trustline", () => {
  it("finds the balance whose asset_code AND asset_issuer both match", async () => {
    const { readWalletBalance } = await loadBalance(live);
    fetchMock.mockResolvedValue(accountResponse([XLM_LINE, USDC_LINE]));

    const result = await readWalletBalance("USDC", ADDRESS);

    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${HORIZON}/accounts/${ADDRESS}`);
    expect(result).toEqual({ ok: true, value: { amount: 2_500_000_000n, trustline: true, unfunded: false } });
  });

  it("ignores a same-code balance from a DIFFERENT issuer (a look-alike asset is not the asset)", async () => {
    const { readWalletBalance } = await loadBalance(live);
    fetchMock.mockResolvedValue(
      accountResponse([{ ...USDC_LINE, asset_issuer: EURC_ISSUER, balance: "999.0000000" }]),
    );

    const result = await readWalletBalance("USDC", ADDRESS);

    // No trustline for the *configured* USDC → the faucet's changeTrust path, not a 999 balance.
    expect(result).toEqual({ ok: true, value: { amount: 0n, trustline: false, unfunded: false } });
  });

  it("reports no trustline when the asset is absent from balances[] — a recoverable zero", async () => {
    const { readWalletBalance } = await loadBalance(live);
    fetchMock.mockResolvedValue(accountResponse([XLM_LINE]));

    expect(await readWalletBalance("USDC", ADDRESS)).toEqual({
      ok: true,
      value: { amount: 0n, trustline: false, unfunded: false },
    });
  });

  it("reports an unfunded account distinctly on a 404 (they need XLM, not a trustline)", async () => {
    const { readWalletBalance } = await loadBalance(live);
    fetchMock.mockResolvedValue(new Response("{}", { status: 404 }));

    expect(await readWalletBalance("USDC", ADDRESS)).toEqual({
      ok: true,
      value: { amount: 0n, trustline: false, unfunded: true },
    });
  });

  it("returns the error arm on a network failure — never throws into a render", async () => {
    const { readWalletBalance } = await loadBalance(live);
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    const result = await readWalletBalance("USDC", ADDRESS);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/Horizon read failed/);
  });

  it("returns the error arm on a 500 and on a non-JSON body", async () => {
    const { readWalletBalance } = await loadBalance(live);

    fetchMock.mockResolvedValue(new Response("nope", { status: 500 }));
    expect((await readWalletBalance("USDC", ADDRESS)).ok).toBe(false);

    fetchMock.mockResolvedValue(new Response("<html>", { status: 200 }));
    expect((await readWalletBalance("USDC", ADDRESS)).ok).toBe(false);
  });
});

describe("Horizon's 7-decimal amounts", () => {
  it("parses losslessly past Number.MAX_SAFE_INTEGER (a plain Number() would corrupt it)", async () => {
    const { toBaseUnits } = await loadBalance(live);

    expect(toBaseUnits("250.0000000")).toBe(2_500_000_000n);
    expect(toBaseUnits("0.1234567")).toBe(1_234_567n);
    expect(toBaseUnits("1")).toBe(10_000_000n);
    // 922337203685.4775807 is Stellar's max amount: 9223372036854775807 base units.
    const max = toBaseUnits("922337203685.4775807");
    expect(max).toBe(9_223_372_036_854_775_807n);
    // A float round-trip corrupts it — which is exactly why the parser never goes through Number().
    expect(BigInt(Number(max))).not.toBe(max);
  });
});
