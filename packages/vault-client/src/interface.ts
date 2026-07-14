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

/**
 * NAV per share as fixed-point, scaled by {@link SHARE_PRICE_SCALE}. A bucket with no accrued yield
 * has a price of exactly `SHARE_PRICE_SCALE` (1 asset per share). Consumers divide by the scale to
 * get an asset value: `assetValue = shares * sharePrice / SHARE_PRICE_SCALE`.
 */
export type PriceRay = bigint;

/** Fixed-point scale for {@link PriceRay}: a share price equal to this means 1 asset per share. */
export const SHARE_PRICE_SCALE = 1_000_000_000n;

/**
 * The demo yield pool's default annual rate, in basis points (`1000` = 10%). Mirrors
 * `DEFAULT_YIELD_RATE_BPS` — the `1000` a `yield_pool` is deployed with — the way {@link SHARE_PRICE_SCALE}
 * mirrors the contract's scale: **the two must agree.** It is the offline fallback the backend quotes as
 * the display APY when the on-chain `rate_bps()` read is unavailable; a pool's live rate is read from the
 * pool, never from the vault seam (a rate is not a vault call), so this is a constant, not a client method.
 */
export const DEFAULT_YIELD_RATE_BPS = 1000;

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
  /**
   * Toggle the depositor's auto-compound (reinvest-rewards) preference. Separate from the safety
   * mandate — `setPolicyConsent` is untouched (KTD3); this is a freely-revocable economic preference,
   * not a risk/pool choice (STE-38 Opsi 2). Signer: depositor. Default (unset) is enabled.
   */
  setAutoCompound(depositor: Address, enabled: boolean): PreparedTx;
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
  /**
   * NAV per share for a currency bucket, scaled by {@link SHARE_PRICE_SCALE}. A bucket with no accrued
   * yield returns exactly `SHARE_PRICE_SCALE`. The backend earnings surfaces read this to convert
   * shares → asset value (the contract exposes only shares via {@link balanceOf}).
   */
  sharePrice(currency: Currency): Promise<PriceRay>;
  /** Current asset value of a user's bucket, derived from NAV: `balanceOf × sharePrice / SHARE_PRICE_SCALE`. */
  assetValueOf(user: Address, currency: Currency): Promise<Amount>;
  /** Current status of a pool (active or frozen). */
  poolStatus(pool: PoolId): Promise<PoolStatus>;
  /** Whether the depositor has signed the one-time safety-mandate consent. */
  hasConsent(depositor: Address): Promise<boolean>;
  /** Whether the depositor wants rewards auto-compounded. Default true (unset = enabled). */
  autoCompoundEnabled(depositor: Address): Promise<boolean>;
  /** The pool currently holding a currency bucket's funds, if allocated. */
  activePool(currency: Currency): Promise<PoolId | null>;
  /** A pending safe-exit proposal for a currency bucket, if any. */
  pendingExit(currency: Currency): Promise<ExitProposal | null>;
}
