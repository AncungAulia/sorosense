/**
 * The single transport between the frontend and the backend's Hono read surface (STE-52b, KTD1/KTD2).
 *
 * Three disciplines, all of them load-bearing:
 *
 *  1. **Never throws.** Every call returns a `Result`-shaped union — `{ ok: true, value }` or
 *     `{ ok: false, code, message }` — mirroring the backend's own `Result` discipline
 *     (`backend/src/lib/result.ts`). A network rejection, a non-2xx, a malformed body and an unset
 *     `NEXT_PUBLIC_API_URL` all collapse into the error arm, so a caller cannot forget a `try` and a
 *     dead backend degrades a surface to its local fallback instead of blanking it.
 *  2. **Env-gated.** With `NEXT_PUBLIC_API_URL` unset the client short-circuits *before* `fetch` — no
 *     request is ever issued (see `config.ts`).
 *  3. **Decoded at the edge.** The backend serializes `bigint` as a decimal string; `toBigInt` turns it
 *     back into a `bigint` losslessly, so the string never travels further into the app.
 *
 * Writes do **not** live here: they are wallet-signed through the vault seam (KTD1). The one exception
 * is `POST /faucet`, a backend write whose issuer secret is backend-only — the client posts
 * `{ address, currency }` and gets back a public tx hash.
 */

import { API_BASE_URL, API_TIMEOUT_MS, apiEnabled } from "./config";
import type { ApiErrorBody } from "./types";

/**
 * Why a call failed. Backend-shaped codes pass through verbatim (`bad_request`, `not_found`,
 * `unavailable`, `timeout`, `http`, `parse` — see `statusForErr` in `backend/src/http/app.ts`); the
 * client synthesizes the rest:
 *  - `disabled`    — `NEXT_PUBLIC_API_URL` is unset; no request was made (the offline guarantee).
 *  - `unavailable` — the request never completed (network error, CORS, backend down).
 *  - `timeout`     — the request outlived {@link API_TIMEOUT_MS} and was aborted.
 *  - `parse`       — a 2xx whose body was not decodable JSON.
 *  - `http`        — a non-2xx whose body carried no shaped `error.code`.
 */
export type ApiErrorCode = string;

/** A failed call. `status`/`body` are present only when the failure came back over the wire. */
export interface ApiFailure {
  ok: false;
  code: ApiErrorCode;
  message: string;
  /** HTTP status, when there was a response (absent for `disabled`/`unavailable`/`timeout`). */
  status?: number;
  /** The decoded body, when it was JSON. The faucet's 409 `needsChangeTrust` payload is read from here. */
  body?: unknown;
}

/** Result of an API call: the value, or a shaped failure. Never a thrown exception. */
export type ApiResult<T> = { ok: true; value: T } | ApiFailure;

/** Query parameters for a GET. `undefined` values are dropped, so callers need no conditional spread. */
export type QueryParams = Record<string, string | number | undefined>;

function fail(
  code: ApiErrorCode,
  message: string,
  extra?: { status?: number; body?: unknown },
): ApiFailure {
  return { ok: false, code, message, ...extra };
}

/** Build the absolute URL for a path, appending the defined query parameters. */
function buildUrl(path: string, query?: QueryParams): string {
  const url = new URL(`${API_BASE_URL}${path}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  return url.toString();
}

/** Decode a response body as JSON. A body that is not JSON is a failure to report, not to throw. */
async function readJson(response: Response): Promise<{ decoded: true; body: unknown } | { decoded: false }> {
  try {
    return { decoded: true, body: (await response.json()) as unknown };
  } catch {
    return { decoded: false };
  }
}

/**
 * Pull `{ error: { code, message } }` out of a non-2xx body. The read routes always send both fields;
 * the faucet sends `{ error: { message } }` with no code, and its 409 sends a bare
 * `{ needsChangeTrust, … }` with no `error` at all. Anything undecodable falls back to the status line
 * rather than being guessed at.
 */
function decodeError(status: number, statusText: string, decoded: { decoded: true; body: unknown } | { decoded: false }): ApiFailure {
  if (!decoded.decoded) {
    return fail("http", `HTTP ${status}${statusText ? ` ${statusText}` : ""}`, { status });
  }
  const body = decoded.body;
  const shaped = (body as Partial<ApiErrorBody> | null)?.error;
  if (shaped && typeof shaped.message === "string") {
    return fail(typeof shaped.code === "string" ? shaped.code : "http", shaped.message, { status, body });
  }
  return fail("http", `HTTP ${status}${statusText ? ` ${statusText}` : ""}`, { status, body });
}

/** One request, shared by GET and POST: env gate → timeout → fetch → decode. Never throws. */
async function request<T>(path: string, query: QueryParams | undefined, init: RequestInit): Promise<ApiResult<T>> {
  // The offline guarantee: with no base URL configured we do not touch `fetch` at all.
  if (!apiEnabled()) {
    return fail("disabled", "backend API is not configured (NEXT_PUBLIC_API_URL is unset)");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(buildUrl(path, query), {
      ...init,
      signal: controller.signal,
      cache: "no-store",
    });
  } catch (cause) {
    const timedOut = controller.signal.aborted;
    const message = cause instanceof Error ? cause.message : String(cause);
    return timedOut
      ? fail("timeout", `request to ${path} timed out after ${API_TIMEOUT_MS}ms`)
      : fail("unavailable", `request to ${path} failed: ${message}`);
  } finally {
    clearTimeout(timer);
  }

  const decoded = await readJson(response);
  if (!response.ok) return decodeError(response.status, response.statusText, decoded);
  if (!decoded.decoded) {
    return fail("parse", `response from ${path} was not valid JSON`, { status: response.status });
  }
  return { ok: true, value: decoded.body as T };
}

/** GET a JSON read route. `T` is the declared wire shape from `types.ts`. */
export function apiGet<T>(path: string, query?: QueryParams): Promise<ApiResult<T>> {
  return request<T>(path, query, { method: "GET", headers: { accept: "application/json" } });
}

/**
 * POST a JSON body. The only write on this transport is `POST /faucet` — a backend-side mint whose
 * secret never leaves the backend; the frontend sends `{ address, currency }` and nothing more.
 */
export function apiPost<T>(path: string, body: unknown): Promise<ApiResult<T>> {
  return request<T>(path, undefined, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
  });
}

/** A decimal-integer string, the wire form of every backend `bigint` field. */
const DECIMAL_INTEGER = /^-?\d+$/;

/**
 * Decode a backend `bigint` field (a decimal string) losslessly. `Number()` would corrupt any value
 * past `Number.MAX_SAFE_INTEGER` — share and asset amounts are 7-dp base units and pass that mark at
 * ~900M units, so this is not hypothetical.
 *
 * An absent or malformed field yields `fallback` (0n) and logs, rather than throwing into a render:
 * the client's no-throw contract holds all the way to the decode.
 */
export function toBigInt(raw: unknown, fallback = 0n): bigint {
  if (typeof raw === "bigint") return raw;
  if (typeof raw === "string" && DECIMAL_INTEGER.test(raw)) return BigInt(raw);
  console.error("[api] expected a decimal-string bigint field, got:", raw);
  return fallback;
}
