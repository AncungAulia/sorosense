"use client";
import { useEffect, useState } from "react";
import { apiEnabled } from "../lib/api/config";
import { apiGet } from "../lib/api/client";
import type { FundingOptions } from "../lib/api/types";
import { STABLECOINS } from "../lib/vault/data";

/**
 * The Add-funds list (R7 · R19) — `GET /funding`, the backend's source of truth for which assets a
 * bucket can be funded with.
 *
 * Two honest sources, like every other read on this surface: with the API off, or the read failed, the
 * local `STABLECOINS` fixture renders — the offline demo can still reach the deposit flow (R11).
 *
 * Unlike `/holdings` this carries **no per-user state**, so there is no mock-divergence to guard
 * against (KTD4 does not apply): the list is the same for everyone, and a mock-mode backend answers it
 * as truthfully as a live one.
 *
 * `rwa` is exposed because the backend sends it and it belongs to this read; no surface renders it yet
 * (the RWA rate shows at the deposit step, not in the list — AE5). RWA options deliberately carry **no**
 * `apy` field, and nothing here carries a risk/label/score/tier field.
 */

/** The fixture list, shaped as the wire type. Offline only. */
const OFFLINE: FundingOptions = { stablecoins: [...STABLECOINS], rwa: [] };

export function useFunding(): { loading: boolean; options: FundingOptions } {
  const [options, setOptions] = useState<FundingOptions | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!apiEnabled()) {
        if (!cancelled) setOptions(OFFLINE);
        return;
      }
      const result = await apiGet<FundingOptions>("/funding");
      if (cancelled) return;
      if (!result.ok) {
        console.error(`[funding] ${result.code}: ${result.message}`);
        setOptions(OFFLINE); // a dead backend must not leave the user unable to add funds
        return;
      }
      setOptions(result.value);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // `loading` is true only until the first client tick; the fallback means the list is never empty.
  return { loading: options === null, options: options ?? OFFLINE };
}
