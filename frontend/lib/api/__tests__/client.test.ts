/**
 * Unit tests for the backend transport (STE-52b / U3).
 *
 * The env gate is read at module scope (`config.ts`, mirroring `lib/wallet.ts`), so every case imports
 * the client *fresh* under a stubbed `NEXT_PUBLIC_API_URL`. `fetch` is a spy throughout — the first
 * test asserts it is never called when the API is unconfigured, which is the offline guarantee the
 * whole vitest + Playwright suite rests on.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Holding } from "../types";

const BASE = "http://localhost:8787";

let fetchMock: ReturnType<typeof vi.fn>;

/** Import the client under a given env. `undefined` ⇒ the var is unset (API off). */
async function loadClient(baseUrl?: string) {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_API_URL", baseUrl ?? "");
  return import("../client");
}

/** A JSON response with the given status, as the backend would send it. */
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("the env gate", () => {
  it("is off with no NEXT_PUBLIC_API_URL, and short-circuits without touching fetch", async () => {
    const { apiGet } = await loadClient(undefined);
    const { apiEnabled, API_BASE_URL } = await import("../config");

    expect(apiEnabled()).toBe(false);
    expect(API_BASE_URL).toBe("");

    const result = await apiGet("/holdings", { depositor: "GABC" });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("disabled");
    // The offline guarantee: not a single request left the app.
    expect(fetchMock).toHaveBeenCalledTimes(0);
  });

  it("is on when the var is set, and the request goes to that base URL", async () => {
    const { apiGet } = await loadClient(BASE);
    fetchMock.mockResolvedValue(jsonResponse([]));

    await apiGet("/holdings", { depositor: "GABC", limit: undefined });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    // `undefined` params are dropped, not serialized as the string "undefined".
    expect(url).toBe(`${BASE}/holdings?depositor=GABC`);
    expect(init.method).toBe("GET");
  });

  it("strips a trailing slash off the configured base URL", async () => {
    const { apiGet } = await loadClient(`${BASE}/`);
    fetchMock.mockResolvedValue(jsonResponse({ status: "ok" }));

    await apiGet("/health");

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe(`${BASE}/health`);
  });
});

describe("apiGet", () => {
  it("returns the value arm on a 200 and decodes a bigint field losslessly", async () => {
    const { apiGet, toBigInt } = await loadClient(BASE);
    // Beyond Number.MAX_SAFE_INTEGER (9_007_199_254_740_991): `Number()` would corrupt this.
    const shares = "90071992547409910123";
    const holding: Holding = {
      currency: "USD",
      name: "DeFindex USDC vault",
      venue: "DeFindex",
      kind: "vault",
      tags: ["DeFindex", "Vault"],
      apy: 0.081,
      shares,
      value: "10240000000",
      valueUsd: 1024,
      frozen: false,
    };
    fetchMock.mockResolvedValue(jsonResponse([holding]));

    const result = await apiGet<Holding[]>("/holdings", { depositor: "GABC" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0]?.shares).toBe(shares);
    expect(toBigInt(result.value[0]?.shares)).toBe(90071992547409910123n);
    expect(toBigInt(result.value[0]?.shares).toString()).toBe(shares);
    // The lossy path this guards against: `Number()` cannot hold this value.
    expect(String(Number(shares))).not.toBe(shares);
  });

  it("preserves the backend's shaped error code on a 400", async () => {
    const { apiGet } = await loadClient(BASE);
    fetchMock.mockResolvedValue(
      jsonResponse(
        { error: { code: "bad_request", message: "missing required query parameter: depositor" } },
        400,
      ),
    );

    const result = await apiGet("/holdings");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("bad_request");
    expect(result.message).toBe("missing required query parameter: depositor");
    expect(result.status).toBe(400);
  });

  it.each([
    [502, "http"],
    [503, "unavailable"],
    [504, "timeout"],
  ])("preserves the shaped error code on a %i", async (status, code) => {
    const { apiGet } = await loadClient(BASE);
    fetchMock.mockResolvedValue(jsonResponse({ error: { code, message: "FX read failed" } }, status));

    const result = await apiGet("/holdings", { depositor: "GABC" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe(code);
    expect(result.status).toBe(status);
  });

  it("falls back to `http` when a non-2xx carries no shaped body", async () => {
    const { apiGet } = await loadClient(BASE);
    fetchMock.mockResolvedValue(new Response("<html>502 Bad Gateway</html>", { status: 502 }));

    const result = await apiGet("/holdings", { depositor: "GABC" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("http");
    expect(result.status).toBe(502);
  });

  it("returns the error arm on a network rejection — it never throws", async () => {
    const { apiGet } = await loadClient(BASE);
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    const result = await apiGet("/health");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("unavailable");
    expect(result.message).toContain("Failed to fetch");
  });

  it("returns the error arm with code `parse` on a malformed 200 body", async () => {
    const { apiGet } = await loadClient(BASE);
    fetchMock.mockResolvedValue(new Response("not json at all", { status: 200 }));

    const result = await apiGet("/health");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("parse");
  });

  it("aborts a hung request after the deadline and returns the error arm", async () => {
    vi.useFakeTimers();
    const { apiGet } = await loadClient(BASE);
    const { API_TIMEOUT_MS } = await import("../config");

    // A backend that never answers: the promise settles only when the client's AbortController fires.
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => {
            reject(Object.assign(new Error("The operation was aborted"), { name: "AbortError" }));
          });
        }),
    );

    const pending = apiGet("/health");
    await vi.advanceTimersByTimeAsync(API_TIMEOUT_MS);
    const result = await pending;

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("timeout");
  });
});

describe("apiPost", () => {
  it("sends only { address, currency } to the faucet and returns the public hash", async () => {
    const { apiPost } = await loadClient(BASE);
    fetchMock.mockResolvedValue(
      jsonResponse({ ok: true, hash: "abc123", currency: "USD", amount: "10000000000" }),
    );

    const result = await apiPost<{ ok: true; hash: string }>("/faucet", {
      address: "GABC",
      currency: "USD",
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE}/faucet`);
    expect(init.method).toBe("POST");
    // No secret ever leaves the client — the request body carries the address and currency, nothing else.
    expect(JSON.parse(String(init.body))).toEqual({ address: "GABC", currency: "USD" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.hash).toBe("abc123");
  });

  it("surfaces the faucet's 409 body so the changeTrust retry path can read it", async () => {
    const { apiPost } = await loadClient(BASE);
    const { isFaucetNeedsChangeTrust } = await import("../types");
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          needsChangeTrust: true,
          currency: "USD",
          sac: "CAAA…",
          message: "add a trustline, then retry",
        },
        409,
      ),
    );

    const result = await apiPost("/faucet", { address: "GABC", currency: "USD" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(409);
    expect(isFaucetNeedsChangeTrust(result.body)).toBe(true);
  });
});

describe("toBigInt", () => {
  it("returns the fallback and logs on a malformed field — it never throws into a render", async () => {
    const { toBigInt } = await loadClient(BASE);

    expect(toBigInt("12.5")).toBe(0n);
    expect(toBigInt(undefined)).toBe(0n);
    expect(toBigInt(null, 7n)).toBe(7n);
    expect(console.error).toHaveBeenCalled();
  });

  it("passes a negative decimal string through", async () => {
    const { toBigInt } = await loadClient(BASE);

    expect(toBigInt("-42")).toBe(-42n);
  });
});
