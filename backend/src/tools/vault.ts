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

import { MockVaultClient, RealVaultClient, type VaultClient } from '@sorosense/vault-client';
import { makeKeeperSigner } from './keeper-signer.js';

let singleton: VaultClient | null = null;

/** Build the real client when every integration var is set; otherwise the mock. */
function create(env: NodeJS.ProcessEnv): VaultClient {
  const contractId = env.VAULT_CONTRACT_ID;
  const rpcUrl = env.STELLAR_RPC_URL;
  const networkPassphrase = env.STELLAR_NETWORK_PASSPHRASE;
  const keeperSecret = env.KEEPER_SECRET;

  if (contractId && rpcUrl && networkPassphrase && keeperSecret) {
    const signer = makeKeeperSigner(keeperSecret, networkPassphrase);
    return new RealVaultClient({ contractId, rpcUrl, networkPassphrase, signer });
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
