/**
 * @sorosense/vault-client — the shared vault seam (KTD1).
 *
 * Import the interface types everywhere; import the mock during development. At U20 the mock is
 * swapped for generated testnet bindings behind the same {@link VaultClient} type, so no consumer
 * changes its imports.
 */

export type {
  Address,
  Amount,
  Currency,
  ExitProposal,
  PoolId,
  PoolStatus,
  PreparedTx,
  Shares,
  Signer,
  SignerRole,
  TxResult,
  VaultClient,
} from './interface.js';

export { MockVaultClient, mockSigner } from './mock.js';
