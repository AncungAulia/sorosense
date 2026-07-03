/**
 * The single JSON-fetch helper. Every remote read in the backend goes through here (DRY), so
 * timeouts, non-2xx responses, and parse failures all become typed {@link Result} errors rather
 * than thrown exceptions. Uses the global `fetch` so tests can stub it.
 */

import { err, ok, type Result } from './result.js';

export interface FetchOptions {
  timeoutMs?: number;
  headers?: Record<string, string>;
}

const DEFAULT_TIMEOUT_MS = 8_000;

export async function getJson<T>(url: string, opts: FetchOptions = {}): Promise<Result<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: opts.headers, signal: controller.signal });
    if (!res.ok) {
      return err('http', `GET ${url} -> ${res.status}`);
    }
    try {
      return ok((await res.json()) as T);
    } catch (e) {
      return err('parse', `invalid JSON from ${url}: ${(e as Error).message}`);
    }
  } catch (e) {
    const name = (e as Error).name;
    if (name === 'AbortError') return err('timeout', `GET ${url} timed out`);
    return err('unavailable', `GET ${url} failed: ${(e as Error).message}`);
  } finally {
    clearTimeout(timer);
  }
}
