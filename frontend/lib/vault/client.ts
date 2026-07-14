/**
 * Which vault the browser talks to — the frontend's mirror of `backend/src/tools/vault.ts` (KTD2).
 *
 * Config-driven: when the three `NEXT_PUBLIC` contract vars are all present the app talks to the
 * deployed testnet vault through {@link RealVaultClient}, signing depositor writes with the connected
 * wallet. With any of them absent it falls back to the in-memory {@link MockVaultClient} — **the
 * default**, and the reason the vitest suite and the Playwright baseline stay offline: Next inlines
 * `NEXT_PUBLIC_*` at build time, so an unset var makes the real branch statically dead code. A dead
 * RPC endpoint during judging degrades the demo to the mock rather than breaking it.
 *
 * Every var here is a **public** value — a contract id, an RPC URL, a network passphrase, pool
 * addresses. No secret is ever `NEXT_PUBLIC_*` (R8): `KEEPER_SECRET` and `FAUCET_ISSUER_SECRET` are
 * backend-only and never reach the browser.
 */

import {
  MockVaultClient,
  RealVaultClient,
  type Address,
  type Currency,
  type PoolId,
  type VaultClient,
} from "@sorosense/vault-client";
import { depositorSigner } from "./signer";

// Read as full literals (never `process.env[key]`) — that is what lets Next inline them and strip the
// real branch from a build that has none of them set.
const CONTRACT_ID = process.env.NEXT_PUBLIC_VAULT_CONTRACT_ID ?? "";
const RPC_URL = process.env.NEXT_PUBLIC_STELLAR_RPC_URL ?? "";
const NETWORK_PASSPHRASE = process.env.NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE ?? "";
const BLEND_POOL_USD = process.env.NEXT_PUBLIC_BLEND_POOL_USD ?? "";
const BLEND_POOL_EUR = process.env.NEXT_PUBLIC_BLEND_POOL_EUR ?? "";

/**
 * True only when EVERY contract var is present — the single source of truth for "are we live?".
 * A partial env (a contract id but no RPC URL) stays on the mock rather than half-building a real
 * client that would fail at submit time, in front of the user.
 */
export function isIntegrationEnv(): boolean {
  return Boolean(CONTRACT_ID && RPC_URL && NETWORK_PASSPHRASE);
}

/**
 * The demo pool slug per currency. Must stay identical to `DEMO_POOL_SLUG` in
 * `backend/src/tools/vault.ts`: both registries key the SAME on-chain pool addresses by these slugs,
 * and the frontend cannot import from the backend. MXN has no demo pool (the faucet mints USD/EUR).
 */
const DEMO_POOL_SLUG: Partial<Record<Currency, PoolId>> = {
  USD: "blend-usdc",
  EUR: "blend-eurc",
};

/** Both directions of pool identity, built from one map so a pool cannot resolve one way only (KTD5). */
export interface PoolRegistry {
  /** Seam slug → on-chain address, for the pool-taking writes and `poolStatus`. */
  resolvePool: (pool: PoolId) => Address;
  /** On-chain address → seam slug, for what `activePool` / `pendingExit` return (R7). */
  poolIdFor: (address: Address) => PoolId;
}

/**
 * Build the pool registry from the configured `BLEND_POOL_*` addresses. Pure (the caller passes the
 * already-inlined values), so it is testable without touching the environment. Returns `undefined`
 * when no pool address is configured — the real client then passes ids through unchanged, exactly as
 * it does today.
 *
 * A slug with no address throws `unknown pool` on the way in; an address with no slug decodes to
 * itself on the way out. That asymmetry is deliberate: writing to a pool we cannot name is a bug,
 * while *displaying* a pool we cannot name is not a reason to blank the user's balance.
 */
export function buildPoolRegistry(
  addresses: Partial<Record<Currency, string>>,
): PoolRegistry | undefined {
  const entries: Array<[PoolId, Address]> = [];
  for (const [currency, slug] of Object.entries(DEMO_POOL_SLUG) as Array<[Currency, PoolId]>) {
    const address = addresses[currency];
    if (address) entries.push([slug, address]);
  }
  if (entries.length === 0) return undefined;

  const bySlug = new Map<PoolId, Address>(entries);
  const byAddress = new Map<Address, PoolId>(entries.map(([slug, address]) => [address, slug]));
  return {
    resolvePool: (pool) => {
      const address = bySlug.get(pool);
      if (!address) throw new Error(`unknown pool: ${pool}`);
      return address;
    },
    poolIdFor: (address) => byAddress.get(address) ?? address,
  };
}

/**
 * The vault client for the connected wallet. Real when the contract env is complete, mock otherwise.
 *
 * The real client is **address-scoped** (KTD3): its bindings client assembles and simulates a write
 * against the connected account as source, so a client built for one address cannot sign for another.
 * `VaultProvider` therefore rebuilds it whenever the connected address changes. Reads need no signer,
 * so a disconnected wallet still gets a working read-only client.
 */
export function createVaultClient(wallet: {
  address?: string | null;
  signTransaction?: (xdr: string) => Promise<string>;
}): VaultClient {
  if (!isIntegrationEnv()) return new MockVaultClient();

  const { address, signTransaction } = wallet;
  const registry = buildPoolRegistry({ USD: BLEND_POOL_USD, EUR: BLEND_POOL_EUR });
  return new RealVaultClient({
    contractId: CONTRACT_ID,
    rpcUrl: RPC_URL,
    networkPassphrase: NETWORK_PASSPHRASE,
    // The wallet's signer seeds the source account for assembling writes; each write is signed again
    // at submit time by the signer the surface passes in (`depositorSigner`), which is this same one.
    signer: address && signTransaction ? depositorSigner(address, signTransaction) : undefined,
    resolvePool: registry?.resolvePool,
    poolIdFor: registry?.poolIdFor,
  });
}
