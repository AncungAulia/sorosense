/**
 * The backend's keeper signer (U20). Builds a seam {@link Signer} from `KEEPER_SECRET` so the
 * RealVaultClient can authorize keeper writes (allocate / rebalance / freeze / propose-exit). The
 * secret is read here, in the backend, and never leaves it — vault-client only ever sees a `Signer`
 * with an opaque `sign(xdr)`, never the key (KEEPER_SECRET is backend-only).
 */

import { Keypair, TransactionBuilder } from '@stellar/stellar-sdk';
import type { Signer } from '@sorosense/vault-client';

/**
 * A keeper `Signer` over a Stellar secret key. `sign(xdr)` decodes the unsigned transaction envelope,
 * signs it with the keypair, and returns the signed envelope XDR — the shape the adapter feeds to the
 * SDK's `signTransaction`. `networkPassphrase` must match the network the tx was assembled on.
 */
export function makeKeeperSigner(secret: string, networkPassphrase: string): Signer {
  const keypair = Keypair.fromSecret(secret);
  return {
    role: 'keeper',
    address: keypair.publicKey(),
    async sign(xdr: string): Promise<string> {
      const tx = TransactionBuilder.fromXDR(xdr, networkPassphrase);
      tx.sign(keypair);
      return tx.toXDR();
    },
  };
}
