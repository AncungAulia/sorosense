import type { Currency } from "@sorosense/vault-client";

/** The stablecoin whose brand logo represents each currency bucket. */
export type TokenSym = "USDC" | "EURC" | "CETES";

const CURRENCY_TOKEN: Record<Currency, TokenSym> = { USD: "USDC", EUR: "EURC", MXN: "CETES" };

// Official token logos under /public/tokens (USDC → Circle SVG, EURC → Circle, CETES → Etherfuse).
// Real brand assets, so this is the one deliberate exception to the monochrome palette (PM-approved).
const FILE: Record<TokenSym, string> = {
  USDC: "/tokens/usdc.svg",
  EURC: "/tokens/eurc.png",
  CETES: "/tokens/cetes.png",
};

/**
 * Circular token logo. Pass a `token` (USDC/EURC/CETES) or a `currency` (USD/EUR/MXN); the currency
 * maps to its funding stablecoin's logo. `object-cover` keeps non-circular source art (CETES) inside
 * the round badge.
 */
export function CoinBadge({
  currency,
  token,
  size = 40,
  className = "",
}: {
  currency?: Currency;
  token?: TokenSym;
  size?: number;
  className?: string;
}) {
  const key: TokenSym = token ?? (currency ? CURRENCY_TOKEN[currency] : "USDC");
  return (
    // eslint-disable-next-line @next/next/no-img-element -- tiny static icon; next/image is overkill and mishandles local SVG
    <img
      src={FILE[key]}
      alt={key}
      width={size}
      height={size}
      style={{ width: size, height: size }}
      className={`shrink-0 rounded-full object-cover ${className}`}
    />
  );
}
