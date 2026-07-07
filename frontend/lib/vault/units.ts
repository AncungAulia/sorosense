import type { Amount, Currency } from "@sorosense/vault-client";

/** Stablecoin base unit (7 decimals), mirroring Stellar stroops-scale assets. */
export const UNIT = 10_000_000n;

const SYMBOL: Record<Currency, string> = { USD: "$", EUR: "€", MXN: "$" };

/** Parse a user-entered decimal (commas allowed) into base units, flooring sub-unit dust. */
export function toAmount(decimal: string): Amount {
  const cleaned = decimal.replace(/,/g, "").trim();
  if (!cleaned || cleaned === ".") return 0n;
  const [whole = "0", frac = ""] = cleaned.split(".");
  const fracPadded = (frac + "0000000").slice(0, 7);
  return BigInt(whole) * UNIT + BigInt(fracPadded || "0");
}

/** Base units → a plain 2dp decimal string (no symbol, no grouping). */
export function fromAmount(a: Amount): string {
  const whole = a / UNIT;
  const frac = (a % UNIT).toString().padStart(7, "0").slice(0, 2);
  return `${whole}.${frac}`;
}

/** Base units → a grouped, symbol-prefixed display string for a currency. */
export function formatCurrency(a: Amount, currency: Currency): string {
  const [whole = "0", frac = "00"] = fromAmount(a).split(".");
  const grouped = Number(whole).toLocaleString("en-US");
  return `${SYMBOL[currency]}${grouped}.${frac}`;
}
