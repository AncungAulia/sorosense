/**
 * Vault access for the backend, reusing the shared seam (@sorosense/vault-client). The backend never
 * redeclares vault types or a second mock (DRY). Today this returns the mock; at U20 it is pointed at
 * the generated testnet bindings behind the same VaultClient type.
 */

import { MockVaultClient, type VaultClient } from '@sorosense/vault-client';

let singleton: VaultClient | null = null;

/** The process-wide vault client. Mock now; swapped for real bindings at U20 (config-driven). */
export function getVaultClient(): VaultClient {
  singleton ??= new MockVaultClient();
  return singleton;
}

/** Reset the client (tests only). */
export function __resetVaultClient(): void {
  singleton = null;
}
