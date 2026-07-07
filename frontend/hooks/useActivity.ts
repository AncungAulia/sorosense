"use client";
import { getActivity, type ActivityItem } from "../lib/vault/data";

export function useActivity(): ActivityItem[] {
  return getActivity();
}
