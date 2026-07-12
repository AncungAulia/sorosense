/**
 * Vault access for the backend, reusing the shared seam (@sorosense/vault-client). The backend never
 * redeclares vault types or a second mock (DRY).
 *
 * Config-driven (U20): when the integration env is fully present the process talks to the deployed
 * testnet contract via {@link RealVaultClient}, signing keeper writes with `KEEPER_SECRET`. When any
 * of those vars is absent it falls back to the in-memory {@link MockVaultClient} — the default for
 * dev and the whole test suite, so nothing needs a network to stay green. `KEEPER_SECRET` is read
 * here and only ever handed to the keeper `Signer`; it never reaches vault-client or the client.
 */

import {
  MockVaultClient,
  RealVaultClient,
  type Address,
  type Currency,
  type PoolId,
  type VaultClient,
} from '@sorosense/vault-client';
import { makeKeeperSigner } from './keeper-signer.js';

let singleton: VaultClient | null = null;

/**
 * True when every integration var is present — the process talks to the deployed testnet contract.
 * The single source of truth for "are we live?", shared by {@link create} and the keeper runner (so
 * the runner refuses real writes in mock mode rather than pretend).
 */
export function isIntegrationEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(
    env.VAULT_CONTRACT_ID &&
      env.STELLAR_RPC_URL &&
      env.STELLAR_NETWORK_PASSPHRASE &&
      env.KEEPER_SECRET,
  );
}

/**
 * The demo pool slug the keeper drives per currency — the settled Fase B question. Each currency's
 * Blend pool is the demo pool; the registry below maps that slug to its `BLEND_POOL_<CCY>` on-chain
 * address. This is the ONE place a currency maps to a pool slug — no pool address is hardcoded here
 * or in `@sorosense/vault-client` (the registry, not the seam, carries addresses).
 */
const DEMO_POOL_SLUG: Partial<Record<Currency, PoolId>> = {
  USD: 'blend-usdc',
  EUR: 'blend-eurc',
};

/** The demo pool slug the keeper drives for a currency. Throws for a currency with no demo pool. */
export function demoPoolFor(currency: Currency): PoolId {
  const slug = DEMO_POOL_SLUG[currency];
  if (!slug) throw new Error(`no demo pool configured for currency: ${currency}`);
  return slug;
}

/**
 * Build the pool registry (seam slug → on-chain {@link Address}) from env — `BLEND_POOL_USD` /
 * `BLEND_POOL_EUR` keyed by each currency's demo pool slug. Passed to {@link RealVaultClient} so its
 * pool-taking writes encode a real contract address. Returns `undefined` when no addresses are set
 * (the mock-default path is unchanged; the real client then passes slugs straight through).
 */
function buildPoolRegistry(env: NodeJS.ProcessEnv): ((pool: PoolId) => Address) | undefined {
  const entries: Array<[PoolId, Address]> = [];
  if (env.BLEND_POOL_USD) entries.push([demoPoolFor('USD'), env.BLEND_POOL_USD]);
  if (env.BLEND_POOL_EUR) entries.push([demoPoolFor('EUR'), env.BLEND_POOL_EUR]);
  if (entries.length === 0) return undefined;
  const registry = new Map<PoolId, Address>(entries);
  return (pool: PoolId): Address => {
    const address = registry.get(pool);
    if (!address) throw new Error(`unknown pool: ${pool}`);
    return address;
  };
}

/** Build the real client when every integration var is set; otherwise the mock. */
function create(env: NodeJS.ProcessEnv): VaultClient {
  const contractId = env.VAULT_CONTRACT_ID;
  const rpcUrl = env.STELLAR_RPC_URL;
  const networkPassphrase = env.STELLAR_NETWORK_PASSPHRASE;
  const keeperSecret = env.KEEPER_SECRET;

  if (contractId && rpcUrl && networkPassphrase && keeperSecret) {
    const signer = makeKeeperSigner(keeperSecret, networkPassphrase);
    return new RealVaultClient({
      contractId,
      rpcUrl,
      networkPassphrase,
      signer,
      resolvePool: buildPoolRegistry(env),
    });
  }
  return new MockVaultClient();
}

/** The process-wide vault client. Real (testnet) when integration env is set; mock otherwise. */
export function getVaultClient(): VaultClient {
  singleton ??= create(process.env);
  return singleton;
}

/** Reset the client (tests only). */
export function __resetVaultClient(): void {
  singleton = null;
}
