/**
 * The backend's secret-key signers (U20 · U1 demo seed). Builds a seam {@link Signer} from a Stellar
 * secret so the RealVaultClient can authorize writes — keeper writes (allocate / rebalance / freeze /
 * propose-exit) under `KEEPER_SECRET`, and the demo depositor's own writes (consent / deposit) under
 * `DEMO_DEPOSITOR_SECRET`. Secrets are read in the backend and never leave it: vault-client only ever
 * sees a `Signer` with an opaque `sign(xdr)`, never the key.
 */

import { Keypair, TransactionBuilder } from '@stellar/stellar-sdk';
import type { Signer, SignerRole } from '@sorosense/vault-client';

/**
 * A `Signer` over a Stellar secret key, for the given role. `sign(xdr)` decodes the unsigned
 * transaction envelope, signs it with the keypair, and returns the signed envelope XDR — the shape the
 * adapter feeds to the SDK's `signTransaction`. `networkPassphrase` must match the network the tx was
 * assembled on. The role is what the seam's `PreparedTx.signAndSubmit` checks: a depositor cannot sign
 * a keeper write, and vice versa.
 */
export function makeSecretSigner(
  secret: string,
  networkPassphrase: string,
  role: SignerRole,
): Signer {
  const keypair = Keypair.fromSecret(secret);
  return {
    role,
    address: keypair.publicKey(),
    async sign(xdr: string): Promise<string> {
      const tx = TransactionBuilder.fromXDR(xdr, networkPassphrase);
      tx.sign(keypair);
      return tx.toXDR();
    },
  };
}

/** The keeper `Signer` (guard writes) over `KEEPER_SECRET`. */
export function makeKeeperSigner(secret: string, networkPassphrase: string): Signer {
  return makeSecretSigner(secret, networkPassphrase, 'keeper');
}

/** The depositor `Signer` (own-funds writes) — the demo seed script signs consent + deposit with it. */
export function makeDepositorSigner(secret: string, networkPassphrase: string): Signer {
  return makeSecretSigner(secret, networkPassphrase, 'depositor');
}
