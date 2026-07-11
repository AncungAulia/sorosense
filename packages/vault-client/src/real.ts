/**
 * Live {@link VaultClient} backed by the generated Soroban bindings (STE-21 / U20).
 *
 * This is the swap-in that replaces {@link MockVaultClient} at integration: same seam shape, but
 * every call goes through the generated contract client (`bindings/src/index.ts`) against a real
 * Stellar RPC. Reads simulate and decode a value directly (`AssembledTransaction.result`); writes
 * return a two-phase {@link PreparedTx} so the caller signs with the correct role before submit —
 * mirroring the mock's `prepare()` contract exactly, so no consumer changes an import.
 *
 * Encoding boundary (seam ⇄ contract):
 *  - Currency `'USD'|'EUR'|'MXN'` ⇄ the contract enum `{ tag: 'Usd'|'Eur'|'Mxn' }`.
 *  - PoolStatus `{ tag: 'Active'|'Frozen' }` → `'active'|'frozen'`.
 *  - `Option<string>` (active pool) → `PoolId | null`; `Option<ExitProposal>` → seam `ExitProposal | null`.
 *  - `i128`/`u64` decode to `bigint`; the seam's `exitId: string` ⇄ the contract's `u64`.
 *
 * The seam's reads return `Promise<T>` directly (never `Result`) and this package never imports
 * `backend` — both hard rules of the DRY seam.
 */

// Consumes the generated bindings' *built* output (`bindings/dist`), not its source: the generated
// `.ts` targets its own (non-strict, DOM-lib) tsconfig, so pulling it into this strict program would
// drag in its errors. `bindings` is (re)built by this package's `pretypecheck`/`pretest` hook.
import { Client as BindingsClient } from '../bindings/dist/index.js';
import type {
  Currency as BindingsCurrency,
  ExitProposal as BindingsExitProposal,
  PoolStatus as BindingsPoolStatus,
  Client as BindingsClientType,
} from '../bindings/dist/index.js';
import type {
  Address,
  Amount,
  Currency,
  ExitProposal,
  PoolId,
  PoolStatus,
  PreparedTx,
  PriceRay,
  Shares,
  Signer,
  SignerRole,
  TxResult,
  VaultClient,
} from './interface';

/**
 * The subset of the generated client this adapter drives. Narrowing to a {@link Pick} keeps tests
 * able to inject a small fake (only these methods) while a real generated {@link BindingsClient}
 * still satisfies it — it's a structural superset.
 */
export type BindingsVaultClient = Pick<
  BindingsClientType,
  | 'balance_of'
  | 'share_price'
  | 'value_of'
  | 'pool_status'
  | 'has_consent'
  | 'auto_compound_enabled'
  | 'active_pool'
  | 'pending_exit'
  | 'deposit'
  | 'withdraw'
  | 'set_policy_consent'
  | 'set_auto_compound'
  | 'approve_exit'
  | 'allocate'
  | 'deallocate'
  | 'freeze'
  | 'unfreeze'
  | 'propose_exit'
>;

/** The assembled write transaction the generated client hands back (all writes decode to `null`). */
type WriteTx = Awaited<ReturnType<BindingsVaultClient['deposit']>>;

/** Options for {@link RealVaultClient}. `client` is injectable so unit tests stay offline. */
export interface RealVaultClientOptions {
  /** The deployed vault contract address (C...). */
  contractId: string;
  /** Stellar RPC endpoint used to simulate reads and submit writes. */
  rpcUrl: string;
  /** Network passphrase (e.g. `networks.testnet.networkPassphrase`). */
  networkPassphrase: string;
  /**
   * Default write signer. Reads need no signer; writes are signed by the signer passed to
   * `signAndSubmit`, but this one's address seeds the source account used to assemble a write.
   */
  signer?: Signer;
  /** Override the underlying generated client — for tests, to avoid any network access. */
  client?: BindingsVaultClient;
}

// ── Encoding helpers (seam ⇄ contract) ──────────────────────────────────────
const toBindingsCurrency = (c: Currency): BindingsCurrency => {
  switch (c) {
    case 'USD':
      return { tag: 'Usd', values: undefined };
    case 'EUR':
      return { tag: 'Eur', values: undefined };
    case 'MXN':
      return { tag: 'Mxn', values: undefined };
  }
};

const fromBindingsCurrency = (c: BindingsCurrency): Currency => {
  switch (c.tag) {
    case 'Usd':
      return 'USD';
    case 'Eur':
      return 'EUR';
    case 'Mxn':
      return 'MXN';
  }
};

const fromBindingsPoolStatus = (s: BindingsPoolStatus): PoolStatus =>
  s.tag === 'Frozen' ? 'frozen' : 'active';

const fromBindingsExitProposal = (p: BindingsExitProposal): ExitProposal => ({
  id: String(p.id),
  currency: fromBindingsCurrency(p.currency),
  fromPool: p.from_pool,
  toPool: p.to_pool,
});

/** Adapt the seam {@link Signer} to the SDK's `signTransaction` shape used by `signAndSend`. */
const toSignTransaction = (signer: Signer) => async (xdr: string) => ({
  signedTxXdr: await signer.sign(xdr),
  signerAddress: signer.address,
});

export class RealVaultClient implements VaultClient {
  private readonly client: BindingsVaultClient;

  constructor(options: RealVaultClientOptions) {
    this.client =
      options.client ??
      new BindingsClient({
        contractId: options.contractId,
        networkPassphrase: options.networkPassphrase,
        rpcUrl: options.rpcUrl,
        // Source account for assembling/simulating writes; reads ignore it.
        publicKey: options.signer?.address,
        signTransaction: options.signer ? toSignTransaction(options.signer) : undefined,
      });
  }

  /**
   * Build a two-phase write. Assembly (and its network simulate) is deferred to `signAndSubmit`,
   * so — like the mock — nothing hits the chain until a correct-role signer submits. `xdr` is a
   * placeholder marker at prepare time; the real envelope is assembled on submit.
   */
  private prepareWrite(
    requiredSigner: SignerRole,
    method: string,
    assemble: () => Promise<WriteTx>,
  ): PreparedTx {
    const xdr = `real-vault:${method}`;
    const signAndSubmit = async (signer: Signer): Promise<TxResult> => {
      if (signer.role !== requiredSigner) {
        throw new Error(`wrong signer: need ${requiredSigner}, got ${signer.role}`);
      }
      const tx = await assemble();
      const sent = await tx.signAndSend({ signTransaction: toSignTransaction(signer) });
      const hash = sent.sendTransactionResponse?.hash ?? '';
      // Success is the finalized on-chain status; a string compare avoids importing the rpc enum.
      const success = String(sent.getTransactionResponse?.status) === 'SUCCESS';
      return { hash, success };
    };
    return { xdr, requiredSigner, signAndSubmit };
  }

  // ── Depositor-signed writes ──────────────────────────────────────────────
  deposit(depositor: Address, currency: Currency, amount: Amount): PreparedTx {
    return this.prepareWrite('depositor', 'deposit', () =>
      this.client.deposit({ depositor, currency: toBindingsCurrency(currency), amount }),
    );
  }

  withdraw(depositor: Address, currency: Currency, shares: Shares): PreparedTx {
    return this.prepareWrite('depositor', 'withdraw', () =>
      this.client.withdraw({ depositor, currency: toBindingsCurrency(currency), shares }),
    );
  }

  setPolicyConsent(depositor: Address): PreparedTx {
    return this.prepareWrite('depositor', 'set_policy_consent', () =>
      this.client.set_policy_consent({ depositor }),
    );
  }

  setAutoCompound(depositor: Address, enabled: boolean): PreparedTx {
    return this.prepareWrite('depositor', 'set_auto_compound', () =>
      this.client.set_auto_compound({ depositor, enabled }),
    );
  }

  approveExit(depositor: Address, exitId: string): PreparedTx {
    return this.prepareWrite('depositor', 'approve_exit', () =>
      this.client.approve_exit({ depositor, exit_id: BigInt(exitId) }),
    );
  }

  // ── Keeper / agent writes ────────────────────────────────────────────────
  allocate(pool: PoolId, currency: Currency, amount: Amount): PreparedTx {
    return this.prepareWrite('keeper', 'allocate', () =>
      this.client.allocate({ pool, currency: toBindingsCurrency(currency), amount }),
    );
  }

  deallocate(pool: PoolId, currency: Currency, amount: Amount): PreparedTx {
    return this.prepareWrite('keeper', 'deallocate', () =>
      this.client.deallocate({ pool, currency: toBindingsCurrency(currency), amount }),
    );
  }

  freeze(pool: PoolId): PreparedTx {
    return this.prepareWrite('keeper', 'freeze', () => this.client.freeze({ pool }));
  }

  unfreeze(pool: PoolId): PreparedTx {
    return this.prepareWrite('keeper', 'unfreeze', () => this.client.unfreeze({ pool }));
  }

  proposeExit(currency: Currency, fromPool: PoolId, toPool: PoolId): PreparedTx {
    return this.prepareWrite('keeper', 'propose_exit', () =>
      this.client.propose_exit({
        currency: toBindingsCurrency(currency),
        from_pool: fromPool,
        to_pool: toPool,
      }),
    );
  }

  // ── Reads (return Promise<T> directly — never Result) ─────────────────────
  async balanceOf(user: Address, currency: Currency): Promise<Shares> {
    const tx = await this.client.balance_of({ user, currency: toBindingsCurrency(currency) });
    return tx.result;
  }

  async sharePrice(currency: Currency): Promise<PriceRay> {
    const tx = await this.client.share_price({ currency: toBindingsCurrency(currency) });
    return tx.result;
  }

  async assetValueOf(user: Address, currency: Currency): Promise<Amount> {
    const tx = await this.client.value_of({ user, currency: toBindingsCurrency(currency) });
    return tx.result;
  }

  async poolStatus(pool: PoolId): Promise<PoolStatus> {
    const tx = await this.client.pool_status({ pool });
    return fromBindingsPoolStatus(tx.result);
  }

  async hasConsent(depositor: Address): Promise<boolean> {
    const tx = await this.client.has_consent({ depositor });
    return tx.result;
  }

  async autoCompoundEnabled(depositor: Address): Promise<boolean> {
    const tx = await this.client.auto_compound_enabled({ depositor });
    return tx.result;
  }

  async activePool(currency: Currency): Promise<PoolId | null> {
    const tx = await this.client.active_pool({ currency: toBindingsCurrency(currency) });
    return tx.result ?? null;
  }

  async pendingExit(currency: Currency): Promise<ExitProposal | null> {
    const tx = await this.client.pending_exit({ currency: toBindingsCurrency(currency) });
    return tx.result ? fromBindingsExitProposal(tx.result) : null;
  }
}
