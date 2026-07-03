/**
 * Reflector price reads for the Sentinel oracle-deviation signal. Network-backed → returns a typed
 * Result so a missing/slow feed becomes a visible error (Sentinel treats that as fail-closed in U8).
 */

import { getJson } from '../lib/http.js';
import { err, ok, type Result } from '../lib/result.js';

export interface AssetPrice {
  asset: string;
  price: number;
  source: 'reflector';
}

interface ReflectorResponse {
  price?: number | string;
}

/**
 * Fetch the latest price for an asset from a Reflector-style feed. `baseUrl` is injectable for
 * config/tests. A non-numeric or missing price is a typed parse error, not a throw.
 */
export async function getReflectorPrice(
  asset: string,
  baseUrl = process.env.REFLECTOR_API_URL ?? 'https://reflector.stellar.org',
): Promise<Result<AssetPrice>> {
  const res = await getJson<ReflectorResponse>(`${baseUrl}/price/${encodeURIComponent(asset)}`);
  if (!res.ok) return res;
  const raw = res.value.price;
  const price = typeof raw === 'string' ? Number(raw) : raw;
  if (price === undefined || Number.isNaN(price)) {
    return err('parse', `no numeric price for ${asset}`);
  }
  return ok({ asset, price, source: 'reflector' });
}
