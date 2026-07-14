"use client";
import { useContext } from "react";
import { VaultContext } from "../providers/VaultProvider";

export function useVault() {
  const ctx = useContext(VaultContext);
  if (!ctx) throw new Error("useVault must be used within <VaultProvider>");
  return ctx;
}
