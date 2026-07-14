"use client";
import { useEffect, useState } from "react";
import { getActivity, type ActivityItem } from "../lib/vault/data";

/**
 * Activity feed. A static fixture today (`getActivity`), but shaped like the future HTTP read
 * (STE-52): `loading` is true until the first client tick, so consumers can show skeletons now and
 * keep them once the real fetch lands. Display-only — no dependency on the vault seam.
 */
export function useActivity(): { loading: boolean; items: ActivityItem[] } {
  const [items, setItems] = useState<ActivityItem[] | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setItems(getActivity());
  }, []);
  return { loading: items === null, items: items ?? [] };
}
