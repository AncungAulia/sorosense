/**
 * Testnet faucet route (STE-21 Fase B, U4 / KTD3 · STE-45). `POST /faucet { address, currency }` mints
 * self-issued testnet USDC/EURC (STE-46) to a requesting address so a judge's empty wallet can deposit.
 *
 * Secret hygiene: the issuer secret NEVER reaches this module. Minting goes through an injected
 * {@link FaucetMinter} — the real one (backend-only, built from `FAUCET_ISSUER_SECRET` in `server.ts`)
 * signs the SAC mint; tests inject a fake. The route is mounted ONLY when a faucet config is supplied
 * (env-gated in `server.ts`), so it is inert on mainnet. USD/EUR only — MXN is not in the live demo.
 */

import type { Hono, Context } from 'hono';

/** A faucet-eligible currency (self-issued SACs exist for these; MXN is internal-only). */
export type FaucetCurrency = 'USD' | 'EUR';

/** Outcome of a mint. `no-trustline` means the recipient must sign `changeTrust` before we can mint. */
export type MintResult = { ok: true; hash: string } | { ok: false; reason: 'no-trustline' };

/** Mints `amount` of the SAC to `to`. The real impl holds the issuer secret; tests inject a fake. */
export interface FaucetMinter {
  mint(sac: string, to: string, amount: bigint): Promise<MintResult>;
}

export interface FaucetConfig {
  /** Self-issued SAC contract id per faucet currency (from env: `USDC_SAC` / `EURC_SAC`). */
  sac: Record<FaucetCurrency, string>;
  /** The mint transport (never carries the secret across the wire). */
  minter: FaucetMinter;
  /** Base units minted per request. Default 1000 whole units (1000 × 1e7). */
  amount?: bigint;
  /** Per-address cooldown in ms. Default 60s. */
  rateLimitMs?: number;
  /** Injectable clock (tests). Default `Date.now`. */
  now?: () => number;
}

const DEFAULT_AMOUNT = 1000n * 10_000_000n; // 1000 units at 7 decimals
const DEFAULT_RATE_LIMIT_MS = 60_000;
/** A well-formed Stellar ed25519 public key: 'G' + 55 base32 chars. */
const STELLAR_PUBKEY = /^G[A-Z2-7]{55}$/;

function bad(c: Context, message: string, status: 400 | 404 | 409 | 429): Response {
  return c.json({ error: { message } }, status);
}

/**
 * Mount `POST /faucet` on the app. Call this only when faucet env is present (see `server.ts`), so the
 * route simply does not exist on mainnet. Rate-limits per address+currency in-memory (one backend
 * process), so claiming USDC does not block the EURC faucet row.
 */
export function mountFaucet(app: Hono, config: FaucetConfig): void {
  const amount = config.amount ?? DEFAULT_AMOUNT;
  const rateLimitMs = config.rateLimitMs ?? DEFAULT_RATE_LIMIT_MS;
  const now = config.now ?? Date.now;
  const lastMintAt = new Map<string, number>();

  app.post('/faucet', async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return bad(c, 'invalid JSON body', 400);
    }
    const { address, currency } = (body ?? {}) as { address?: unknown; currency?: unknown };

    if (typeof address !== 'string' || !STELLAR_PUBKEY.test(address)) {
      return bad(c, 'invalid or missing Stellar address', 400);
    }
    if (currency !== 'USD' && currency !== 'EUR') {
      return bad(c, "unsupported currency: faucet mints USD or EUR only", 400);
    }

    const limitKey = `${address}:${currency}`;
    const last = lastMintAt.get(limitKey);
    if (last !== undefined && now() - last < rateLimitMs) {
      return bad(c, 'rate limited: try again later', 429);
    }

    const result = await config.minter.mint(config.sac[currency], address, amount);
    if (!result.ok) {
      // Recipient has no trustline for the SAC — they must sign changeTrust first (user-signed, no secret).
      return c.json(
        { needsChangeTrust: true, currency, sac: config.sac[currency], message: 'add a trustline, then retry' },
        409,
      );
    }

    lastMintAt.set(limitKey, now());
    // Response carries only the public tx hash — never the issuer secret.
    return c.json({ ok: true, hash: result.hash, currency, amount: amount.toString() });
  });
}
