/**
 * The user's **real** stablecoin balance, read from Horizon (R6 · A2).
 *
 * Why Horizon and not the vault seam: this is a classic **trustline** balance on the user's own
 * account, not vault state. `RealVaultClient` has no method for it and adding one would pollute the
 * seam. `GET /accounts/{G…}` answers both questions the deposit surface has at once — *how much do
 * they hold* and *does the trustline even exist* — and the second is exactly what the faucet's 409
 * `needsChangeTrust` path needs.
 *
 * Three outcomes the UI must tell apart, because each is a different fix for the user:
 *  - a trustline with a balance      → deposit;
 *  - **no trustline** for the asset  → "Get test funds" (the faucet mints after a `changeTrust`);
 *  - **the account does not exist**  → they need XLM first; a faucet mint cannot help them.
 *
 * Env-gated like everything else (KTD2): with `NEXT_PUBLIC_STELLAR_HORIZON_URL` or the issuer unset,
 * `balanceEnabled()` is false, no request is ever issued, and `useWalletBalance` renders the fixture.
 * Client-only (KTD7) — every caller runs this inside a `useEffect`, never at module scope.
 */

import type { StablecoinSym } from "../vault/data";
import { UNIT } from "../vault/units";

/**
 * Each var is read as a literal `process.env.NEXT_PUBLIC_*` expression: Next inlines those textually
 * at build time, and a computed lookup (`process.env[name]`) would inline to `undefined`.
 */
const HORIZON_URL = (process.env.NEXT_PUBLIC_STELLAR_HORIZON_URL ?? "").replace(/\/+$/, "");
const USDC_ISSUER = process.env.NEXT_PUBLIC_USDC_ISSUER ?? "";
const EURC_ISSUER = process.env.NEXT_PUBLIC_EURC_ISSUER ?? "";

/** How long a Horizon read may hang before we give up and fall back. Mirrors `API_TIMEOUT_MS`. */
const HORIZON_TIMEOUT_MS = 5_000;

/** A classic Stellar asset: the code + issuer pair a trustline (and `changeTrust`) is keyed by. */
export interface ClassicAsset {
  code: string;
  issuer: string;
}

/**
 * The classic asset behind a stablecoin symbol, or `null` when it is not configured. CETES/MXN has no
 * self-issued testnet asset in the demo (the faucet mints USD/EUR only), so it is never live.
 */
export function assetFor(sym: StablecoinSym): ClassicAsset | null {
  const issuer = sym === "USDC" ? USDC_ISSUER : sym === "EURC" ? EURC_ISSUER : "";
  return HORIZON_URL && issuer ? { code: sym, issuer } : null;
}

/** True only when Horizon *and* this symbol's issuer are configured. Otherwise: the fixture, no request. */
export function balanceEnabled(sym: StablecoinSym): boolean {
  return assetFor(sym) !== null;
}

/** Horizon's origin, without a trailing slash. `""` when unconfigured. */
export function horizonUrl(): string {
  return HORIZON_URL;
}

/** One Horizon balance line (the fields we read; Horizon sends more). */
interface HorizonBalance {
  balance?: unknown;
  asset_type?: unknown;
  asset_code?: unknown;
  asset_issuer?: unknown;
}

/**
 * A resolved balance. `trustline: false` means the asset is absent from `balances[]`; `unfunded: true`
 * means Horizon 404'd the account entirely (it holds no XLM, so it does not exist on-chain yet). Both
 * carry `amount: 0n` — the difference is what the UI offers next, not the number.
 */
export interface WalletBalance {
  /** Base units (7 dp), the same convention as `lib/vault/units.ts`. */
  amount: bigint;
  trustline: boolean;
  unfunded: boolean;
}

/** Never throws (mirrors `lib/api/client.ts`): a failed read is a value the caller can fall back from. */
export type BalanceResult = { ok: true; value: WalletBalance } | { ok: false; message: string };

/**
 * Horizon renders every amount as a fixed 7-decimal string ("250.0000000"). Parse it to base units
 * without going through `Number`, which would corrupt large balances.
 */
export function toBaseUnits(horizonAmount: string): bigint {
  const [whole = "0", frac = ""] = horizonAmount.trim().split(".");
  const padded = (frac + "0000000").slice(0, 7);
  const sign = whole.startsWith("-") ? -1n : 1n;
  const digits = whole.replace(/^[+-]/, "") || "0";
  return sign * (BigInt(digits) * UNIT + BigInt(padded || "0"));
}

/**
 * Read `{HORIZON}/accounts/{address}` and pick out the trustline for `sym`'s configured asset.
 *
 * A raw `fetch` rather than `Horizon.Server.loadAccount`: this is one GET whose 404 is *meaningful*
 * (unfunded account, not an error), and keeping it a plain request keeps the failure catchable and the
 * whole path testable against a recorded Horizon body. The SDK is used where it earns its weight —
 * building the `changeTrust` XDR (`changeTrust.ts`).
 */
export async function readWalletBalance(sym: StablecoinSym, address: string): Promise<BalanceResult> {
  const asset = assetFor(sym);
  if (!asset) return { ok: false, message: `Horizon is not configured for ${sym}` };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HORIZON_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${HORIZON_URL}/accounts/${address}`, {
      headers: { accept: "application/json" },
      signal: controller.signal,
      cache: "no-store",
    });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    return { ok: false, message: `Horizon read failed: ${message}` };
  } finally {
    clearTimeout(timer);
  }

  // 404 = the account has never been funded with XLM. Not an error — a distinct state: the user needs
  // XLM before a trustline (and therefore before any mint) is even possible.
  if (response.status === 404) {
    return { ok: true, value: { amount: 0n, trustline: false, unfunded: true } };
  }
  if (!response.ok) {
    return { ok: false, message: `Horizon responded ${response.status}` };
  }

  let body: { balances?: unknown };
  try {
    body = (await response.json()) as { balances?: unknown };
  } catch {
    return { ok: false, message: "Horizon response was not valid JSON" };
  }

  const balances: HorizonBalance[] = Array.isArray(body.balances) ? (body.balances as HorizonBalance[]) : [];
  const line = balances.find(
    (b) =>
      b.asset_type !== "native" && b.asset_code === asset.code && b.asset_issuer === asset.issuer,
  );

  // The asset is absent from balances[] → no trustline. Zero balance, but a *recoverable* zero: this is
  // what puts the faucet's changeTrust path in front of the user instead of a "not enough balance" wall.
  if (!line || typeof line.balance !== "string") {
    return { ok: true, value: { amount: 0n, trustline: false, unfunded: false } };
  }

  try {
    return { ok: true, value: { amount: toBaseUnits(line.balance), trustline: true, unfunded: false } };
  } catch {
    // `BigInt()` throws on a non-decimal string. The no-throw contract holds all the way through the
    // decode: a malformed amount is an error the caller falls back from, never an unhandled rejection.
    return { ok: false, message: `Horizon sent an unparseable balance: ${line.balance}` };
  }
}
