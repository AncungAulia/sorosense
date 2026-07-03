/**
 * SoroSense vault — the authoritative callable surface (KTD1, the DRY seam).
 *
 * This single file describes the vault's operations so the contract, backend, and frontend
 * tracks build against one shape in parallel. The mock (`mock.ts`) implements it now; generated
 * bindings replace the mock at U20 without any consumer changing an import.
 *
 * Product invariants encoded here:
 *  - Funds are organized into per-currency buckets; the vault never converts between currencies (R3, R23).
 *  - Consent is a single one-time safety mandate — there is NO risk-tier parameter anywhere (KTD3).
 *  - Auto-compound and auto-rebalance run under that mandate with no per-move signature; the only
 *    depositor-signed fund movements are a Sentinel-freeze exit and a withdrawal (R5, R7).
 *  - `freeze` is protective only: it blocks flows into a pool and never moves funds (R9, R10, KTD4).
 */

/** Bucket denomination. One bucket per currency the depositor actually funded — never split/converted. */
export type Currency = 'USD' | 'EUR' | 'MXN';

/** Stellar account address (G... or C... contract address). */
export type Address = string;

/** Opaque pool identifier (e.g. a Blend pool contract address). */
export type PoolId = string;

/** Base-unit integer amount (stroops-scale). Uses bigint to avoid float drift. */
export type Amount = bigint;

/** Vault share units, tracked per depositor per currency. */
export type Shares = bigint;

/** A pool is either accepting flows or frozen by the keeper (Sentinel). */
export type PoolStatus = 'active' | 'frozen';

/** Who must sign a given transaction. Depositors sign their own funds; the keeper signs guard ops. */
export type SignerRole = 'depositor' | 'keeper';

/** A signer capable of authorizing a prepared transaction for its role. */
export interface Signer {
  role: SignerRole;
  address: Address;
  /** Sign the transaction envelope (XDR) and return the signature. Real impl talks to a wallet/keypair. */
  sign(xdr: string): Promise<string>;
}

/** Result of submitting a signed transaction. */
export interface TxResult {
  hash: string;
  success: boolean;
}

/**
 * Two-phase lifecycle: build → sign → submit. Reads return values directly; state-changing calls
 * return a PreparedTx so the caller signs with the correct role (depositor vs keeper) before submit.
 */
export interface PreparedTx {
  /** The XDR envelope to be signed. */
  readonly xdr: string;
  /** Which role must sign this transaction. Submitting with the wrong role rejects. */
  readonly requiredSigner: SignerRole;
  /** Sign with the given signer and submit. Rejects if the signer role is wrong or a guard blocks it. */
  signAndSubmit(signer: Signer): Promise<TxResult>;
}

/** A pending safe-exit the agent proposed after a Sentinel freeze; the depositor approves it (F3). */
export interface ExitProposal {
  id: string;
  currency: Currency;
  fromPool: PoolId;
  toPool: PoolId;
}

/**
 * The vault's callable surface. Depositor-facing writes, keeper/agent writes, and reads.
 * Note: no method takes a risk tier — allocation always targets the safest-highest Safe pool.
 */
export interface VaultClient {
  // ── Depositor-signed writes ────────────────────────────────────────────
  /** Deposit `amount` of the currency's stablecoin into that currency bucket. Signer: depositor. */
  deposit(depositor: Address, currency: Currency, amount: Amount): PreparedTx;
  /** Burn `shares` from the depositor's bucket and return the stablecoin. Signer: depositor. */
  withdraw(depositor: Address, currency: Currency, shares: Shares): PreparedTx;
  /**
   * Record the one-time safety-mandate consent (KTD3). Idempotent — re-signing is a no-op.
   * There is NO tier argument; consent authorizes auto-allocate/rebalance/compound within the
   * Sentinel-vetted Safe set, in the bucket's own currency, supply/vault/hold-to-earn only.
   */
  setPolicyConsent(depositor: Address): PreparedTx;
  /** Approve an agent-proposed safe exit after a freeze, moving funds to the target pool. Signer: depositor. */
  approveExit(depositor: Address, exitId: string): PreparedTx;

  // ── Keeper / agent writes (no depositor signature; run under consent) ───
  /** Move pooled funds of a currency into a pool. Signer: keeper (or an approved-proposal path). */
  allocate(pool: PoolId, currency: Currency, amount: Amount): PreparedTx;
  /** Withdraw pooled funds from a pool back to the vault. Signer: keeper. */
  deallocate(pool: PoolId, currency: Currency, amount: Amount): PreparedTx;
  /** Protective freeze — blocks flows into `pool` without moving funds. Signer: keeper (Sentinel). */
  freeze(pool: PoolId): PreparedTx;
  /** Lift a freeze once a pool is healthy again. Signer: keeper. */
  unfreeze(pool: PoolId): PreparedTx;
  /** Record an agent-proposed safe exit for a frozen pool; the depositor approves it later. Signer: keeper. */
  proposeExit(currency: Currency, fromPool: PoolId, toPool: PoolId): PreparedTx;

  // ── Reads ──────────────────────────────────────────────────────────────
  /** Shares the user holds in a given currency bucket. */
  balanceOf(user: Address, currency: Currency): Promise<Shares>;
  /** Current status of a pool (active or frozen). */
  poolStatus(pool: PoolId): Promise<PoolStatus>;
  /** Whether the depositor has signed the one-time safety-mandate consent. */
  hasConsent(depositor: Address): Promise<boolean>;
  /** The pool currently holding a currency bucket's funds, if allocated. */
  activePool(currency: Currency): Promise<PoolId | null>;
  /** A pending safe-exit proposal for a currency bucket, if any. */
  pendingExit(currency: Currency): Promise<ExitProposal | null>;
}
