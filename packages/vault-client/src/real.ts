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
  /**
   * Registry that turns a seam {@link PoolId} slug (e.g. `'blend-usdc'`) into the pool's on-chain
   * contract {@link Address} before it's encoded for the vault. Injected by the caller (the backend
   * builds it from env + catalog) — **no pool address is ever hardcoded in this package**. When
   * omitted, pool slugs pass straight through (today's behavior, for callers already using addresses);
   * when provided but a slug can't be resolved, the pool-taking method throws a clear `unknown pool`.
   */
  resolvePool?: (poolId: PoolId) => Address;
  /**
   * The inverse of {@link RealVaultClientOptions.resolvePool}: decodes a pool {@link Address} the
   * contract *returns* (`active_pool`, `pending_exit`) back to its seam {@link PoolId} slug, so the
   * value can be fed straight back into a pool-taking method (`poolStatus`, `allocate`) without
   * tripping `unknown pool` — the round trip `useBuckets` performs (R7, KTD5).
   *
   * Built from the SAME map as `resolvePool` by the caller, so a pool cannot resolve one way and not
   * the other. Unlike the forward direction, an address the registry does not know decodes to
   * **itself** rather than throwing: an unrecognized pool is a display concern, never a reason to
   * blank the user's balance. Omitted ⇒ addresses pass through unchanged (today's behavior).
   */
  poolIdFor?: (address: Address) => PoolId;
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

/**
 * Decode a contract exit proposal, running both pool addresses back through `decodePool` so the
 * proposal's `fromPool`/`toPool` are seam slugs a caller can pass to `poolStatus` (R7).
 */
const fromBindingsExitProposal = (
  p: BindingsExitProposal,
  decodePool: (address: Address) => PoolId,
): ExitProposal => ({
  id: String(p.id),
  currency: fromBindingsCurrency(p.currency),
  fromPool: decodePool(p.from_pool),
  toPool: decodePool(p.to_pool),
});

/** Adapt the seam {@link Signer} to the SDK's `signTransaction` shape used by `signAndSend`. */
const toSignTransaction = (signer: Signer) => async (xdr: string) => ({
  signedTxXdr: await signer.sign(xdr),
  signerAddress: signer.address,
});

export class RealVaultClient implements VaultClient {
  private readonly client: BindingsVaultClient;
  private readonly resolvePool?: (poolId: PoolId) => Address;
  private readonly poolIdFor?: (address: Address) => PoolId;

  constructor(options: RealVaultClientOptions) {
    this.resolvePool = options.resolvePool;
    this.poolIdFor = options.poolIdFor;
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
   * Resolve a seam {@link PoolId} slug to the pool's on-chain {@link Address} via the injected
   * registry before it's encoded for the contract. With no registry the slug passes through
   * (callers already holding an address keep working); with a registry, a slug that resolves to
   * nothing — or a resolver that throws — surfaces a clear `unknown pool: <slug>` rather than a
   * downstream ScVal encode failure. One helper, used by every pool-taking method (DRY).
   */
  private poolAddress(pool: PoolId): Address {
    if (!this.resolvePool) return pool;
    let resolved: Address | undefined;
    try {
      resolved = this.resolvePool(pool);
    } catch (cause) {
      throw new Error(`unknown pool: ${pool}`, { cause });
    }
    if (!resolved) throw new Error(`unknown pool: ${pool}`);
    return resolved;
  }

  /**
   * The inverse of {@link RealVaultClient.poolAddress}: decode a pool {@link Address} the contract
   * returned back to its seam {@link PoolId} slug, so the value round-trips into `poolStatus` and the
   * pool-taking writes (R7 — `useBuckets` reads `activePool` and hands the result straight to
   * `poolStatus`; without this the forward resolver rejects the address as an unknown slug).
   *
   * Never throws: an address the registry does not know (a pool the keeper allocated to outside this
   * config) decodes to itself, so the caller still gets a usable id and the user still sees a balance.
   * One helper, used by every read that returns a pool (DRY).
   */
  private poolId(address: Address): PoolId {
    if (!this.poolIdFor) return address;
    try {
      return this.poolIdFor(address) || address;
    } catch {
      return address; // an unknown pool is a display concern, not a failed read
    }
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
    const address = this.poolAddress(pool);
    return this.prepareWrite('keeper', 'allocate', () =>
      this.client.allocate({ pool: address, currency: toBindingsCurrency(currency), amount }),
    );
  }

  deallocate(pool: PoolId, currency: Currency, amount: Amount): PreparedTx {
    const address = this.poolAddress(pool);
    return this.prepareWrite('keeper', 'deallocate', () =>
      this.client.deallocate({ pool: address, currency: toBindingsCurrency(currency), amount }),
    );
  }

  freeze(pool: PoolId): PreparedTx {
    const address = this.poolAddress(pool);
    return this.prepareWrite('keeper', 'freeze', () => this.client.freeze({ pool: address }));
  }

  unfreeze(pool: PoolId): PreparedTx {
    const address = this.poolAddress(pool);
    return this.prepareWrite('keeper', 'unfreeze', () => this.client.unfreeze({ pool: address }));
  }

  proposeExit(currency: Currency, fromPool: PoolId, toPool: PoolId): PreparedTx {
    const fromAddress = this.poolAddress(fromPool);
    const toAddress = this.poolAddress(toPool);
    return this.prepareWrite('keeper', 'propose_exit', () =>
      this.client.propose_exit({
        currency: toBindingsCurrency(currency),
        from_pool: fromAddress,
        to_pool: toAddress,
      }),
    );
  }

  // ── Reads (return Promise<T> directly — never Result) ─────────────────────
  async balanceOf(user: Address, currency: Currency): Promise<Shares> {
    const tx = await this.client.balance_of({ user, currency: toBindingsCurrency(currency) });
    return tx.result;
  }

  // As of vault binver 1.3.0 this is a mark-to-market read: the price rises as the
  // bucket's pools accrue interest on-chain (NAV = idle + Σ pool.balance(vault)), so a
  // repeated call returns a growing number even with no deposit — no longer pinned to
  // SHARE_PRICE_SCALE until yield "ships".
  async sharePrice(currency: Currency): Promise<PriceRay> {
    const tx = await this.client.share_price({ currency: toBindingsCurrency(currency) });
    return tx.result;
  }

  async assetValueOf(user: Address, currency: Currency): Promise<Amount> {
    const tx = await this.client.value_of({ user, currency: toBindingsCurrency(currency) });
    return tx.result;
  }

  async poolStatus(pool: PoolId): Promise<PoolStatus> {
    const tx = await this.client.pool_status({ pool: this.poolAddress(pool) });
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
    const address = tx.result ?? null;
    // Decode the returned Address back to a seam slug so the caller can pass it to poolStatus (R7).
    return address === null ? null : this.poolId(address);
  }

  async pendingExit(currency: Currency): Promise<ExitProposal | null> {
    const tx = await this.client.pending_exit({ currency: toBindingsCurrency(currency) });
    return tx.result
      ? fromBindingsExitProposal(tx.result, (address) => this.poolId(address))
      : null;
  }
}
