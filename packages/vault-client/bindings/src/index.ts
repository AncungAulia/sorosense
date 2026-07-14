import { Buffer } from "buffer";
import { Address } from "@stellar/stellar-sdk";
import {
  AssembledTransaction,
  Client as ContractClient,
  ClientOptions as ContractClientOptions,
  MethodOptions,
  Result,
  Spec as ContractSpec,
} from "@stellar/stellar-sdk/contract";
import type {
  u32,
  i32,
  u64,
  i64,
  u128,
  i128,
  u256,
  i256,
  Option,
  Timepoint,
  Duration,
} from "@stellar/stellar-sdk/contract";
export * from "@stellar/stellar-sdk";
export * as contract from "@stellar/stellar-sdk/contract";
export * as rpc from "@stellar/stellar-sdk/rpc";

if (typeof window !== "undefined") {
  //@ts-ignore Buffer exists
  window.Buffer = window.Buffer || Buffer;
}


export const networks = {
  testnet: {
    networkPassphrase: "Test SDF Network ; September 2015",
    contractId: "CCK5G4FQ53Y7TIQY6CZLOSLCF5DKL44XV2LNFKCMHTSCWNWEAI3D457Y",
  }
} as const

/**
 * Typed panics. `#[contracterror]` lets tests assert the exact failure via the
 * `try_*` client entrypoints instead of matching panic strings.
 */
export const Errors = {
  1: {message:"Paused"},
  2: {message:"TokenNotSet"},
  3: {message:"NoConsent"},
  4: {message:"NonPositiveAmount"},
  5: {message:"BelowMinFirstDeposit"},
  6: {message:"InsufficientShares"},
  7: {message:"PoolFrozen"},
  8: {message:"CapExceeded"},
  9: {message:"InsufficientHoldings"},
  10: {message:"EmptyBucket"},
  11: {message:"NoPendingExit"},
  12: {message:"NotAStakeholder"},
  /**
   * Target pool is not in the admin-vetted Safe set (KTD-SC1 allowlist).
   */
  13: {message:"PoolNotAllowed"},
  /**
   * A freeze-exit was approved for a pool that is not actually frozen.
   */
  14: {message:"SourceNotFrozen"}
}


/**
 * Instance config set at `init`. Pool addresses live in their own per-currency
 * storage (set via `set_configured_pool`) so a bucket can be re-pointed without
 * re-deploying (the U21 risky-pool seam).
 */
export interface Config {
  /**
 * Minimum first deposit into an empty bucket (secondary inflation-attack guard).
 */
min_first_deposit: i128;
  /**
 * Max holdings a single pool may hold, per pool (guard against over-concentration).
 */
per_pool_cap: i128;
  /**
 * Virtual shares/assets offset defeating the donation-inflation attack (KTD-SC3).
 */
virtual_offset: i128;
}

/**
 * Bucket denomination. One bucket per currency the depositor actually funded —
 * never split or converted (R3, R23).
 */
export type Currency = {tag: "Usd", values: void} | {tag: "Eur", values: void} | {tag: "Mxn", values: void};

/**
 * Pool lifecycle status, matching the interface's `'active' | 'frozen'` union.
 */
export type PoolStatus = {tag: "Active", values: void} | {tag: "Frozen", values: void};


/**
 * A keeper-proposed safe exit after a Sentinel freeze; the depositor approves it (F3).
 */
export interface ExitProposal {
  currency: Currency;
  from_pool: string;
  id: u64;
  to_pool: string;
}











export type DataKey = {tag: "Admin", values: void} | {tag: "Keeper", values: void} | {tag: "Config", values: void} | {tag: "Paused", values: void} | {tag: "ExitCounter", values: void} | {tag: "Token", values: readonly [Currency]} | {tag: "ConfiguredPool", values: readonly [Currency]} | {tag: "AllowedPool", values: readonly [string]} | {tag: "Shares", values: readonly [string, Currency]} | {tag: "TotalShares", values: readonly [Currency]} | {tag: "TotalAssets", values: readonly [Currency]} | {tag: "ActivePool", values: readonly [Currency]} | {tag: "PoolHoldings", values: readonly [Currency, string]} | {tag: "Consent", values: readonly [string]} | {tag: "AutoCompound", values: readonly [string]} | {tag: "Frozen", values: readonly [string]} | {tag: "PendingExit", values: readonly [Currency]};

export interface Client {
  /**
   * Construct and simulate a pause transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Emergency global pause of state-changing entrypoints. Admin-only.
   */
  pause: (options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a freeze transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Protective freeze — blocks flows into `pool` without moving funds. Keeper-only.
   */
  freeze: ({pool}: {pool: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a deposit transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Deposit `amount` of the currency's stablecoin into that bucket. Requires
   * prior consent (KTD-SC2), so every principal in a pooled bucket is consented.
   */
  deposit: ({depositor, currency, amount}: {depositor: string, currency: Currency, amount: i128}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a unpause transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Lift the global pause. Admin-only.
   */
  unpause: (options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a upgrade transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Replace the contract's WASM with a new build (admin-governed upgrade).
   * Storage is preserved — only code changes — so bug fixes and the deferred
   * features (real-Blend ABI, mark-to-market NAV) can ship without migrating
   * funds. Admin-only; a compromised admin could swap logic, so production
   * should move this behind a timelock/multisig (deferred, see plan).
   */
  upgrade: ({new_wasm_hash}: {new_wasm_hash: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a allocate transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Supply pooled bucket funds into a pool. Keeper-only, consent-gated (bucket
   * has consented deposits); the allowlist / frozen / cap guards are enforced by
   * `supply_to_pool` so every inbound path shares one definition.
   */
  allocate: ({pool, currency, amount}: {pool: string, currency: Currency, amount: i128}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a unfreeze transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Lift a freeze once a pool is healthy again. Keeper-only.
   */
  unfreeze: ({pool}: {pool: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a value_of transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Current asset value of a user's bucket — what `withdraw` would return for the
   * full share balance today. Derived straight from NAV rather than composed from
   * `share_price`, so the caller never eats a second rounding truncation.
   */
  value_of: ({user, currency}: {user: string, currency: Currency}, options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a withdraw transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Burn `shares` from the depositor's bucket and return the stablecoin.
   * Assumes the redeemed value is liquid in the vault (backend deallocates first).
   */
  withdraw: ({depositor, currency, shares}: {depositor: string, currency: Currency, shares: i128}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a set_token transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Register the SEP-41 stablecoin SAC backing a currency bucket. Admin-only.
   */
  set_token: ({currency, token}: {currency: Currency, token: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a balance_of transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Shares the user holds in a currency bucket.
   */
  balance_of: ({user, currency}: {user: string, currency: Currency}, options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a deallocate transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Withdraw pooled funds from a pool back to the vault. Keeper-only.
   */
  deallocate: ({pool, currency, amount}: {pool: string, currency: Currency, amount: i128}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a active_pool transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * The pool currently holding a currency bucket's funds, if allocated.
   */
  active_pool: ({currency}: {currency: Currency}, options?: MethodOptions) => Promise<AssembledTransaction<Option<string>>>

  /**
   * Construct and simulate a has_consent transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Whether the depositor has recorded the one-time safety-mandate consent.
   */
  has_consent: ({depositor}: {depositor: string}, options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

  /**
   * Construct and simulate a pool_status transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Whether a pool is accepting flows or frozen by the keeper.
   */
  pool_status: ({pool}: {pool: string}, options?: MethodOptions) => Promise<AssembledTransaction<PoolStatus>>

  /**
   * Construct and simulate a share_price transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * NAV per share for a currency bucket, scaled by `SHARE_PRICE_SCALE` (R12). A
   * bucket with no accrued yield prices at exactly the scale. The backend earnings
   * surfaces read this to turn shares into an asset value, since `balance_of`
   * reports shares alone.
   */
  share_price: ({currency}: {currency: Currency}, options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a approve_exit transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Approve a keeper-proposed safe exit after a freeze, moving the bucket's
   * funds to the safe pool. Bound to a stakeholder: the caller must hold shares
   * in the exiting bucket (KTD-SC5).
   */
  approve_exit: ({depositor, exit_id}: {depositor: string, exit_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a pending_exit transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * A pending safe-exit proposal for a currency bucket, if any.
   */
  pending_exit: ({currency}: {currency: Currency}, options?: MethodOptions) => Promise<AssembledTransaction<Option<ExitProposal>>>

  /**
   * Construct and simulate a pool_allowed transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Whether a pool is in the allowlist (read).
   */
  pool_allowed: ({pool}: {pool: string}, options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

  /**
   * Construct and simulate a propose_exit transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Record a keeper-proposed safe exit for a frozen bucket; a depositor approves
   * it later via `approve_exit`. Keeper-only.
   */
  propose_exit: ({currency, from_pool, to_pool}: {currency: Currency, from_pool: string, to_pool: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a configured_pool transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * The configured/target pool for a bucket (the demo re-target seam).
   */
  configured_pool: ({currency}: {currency: Currency}, options?: MethodOptions) => Promise<AssembledTransaction<Option<string>>>

  /**
   * Construct and simulate a set_pool_allowed transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Add or remove a pool from the on-chain allowlist — the Sentinel-vetted Safe
   * set that every `allocate`/exit destination is checked against (KTD-SC1). This
   * is the on-chain backstop: even a compromised keeper can only move funds into
   * an admin-vetted pool. Admin-only.
   */
  set_pool_allowed: ({pool, allowed}: {pool: string, allowed: boolean}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a set_auto_compound transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Turn the depositor's auto-compound (reinvest-rewards) preference on or off.
   * Idempotent. This is an *economic* preference, deliberately not part of the
   * safety mandate: `set_policy_consent` stays whole and unrevocable, because a
   * bucket is pooled and a revoked consent would leave the keeper unable to tell
   * one depositor's shares from the rest (STE-38 opsi 2, KTD3 + KTD-SC2 intact).
   * Turning it off stops reinvestment only — allocate, rebalance, and the
   * freeze-exit path are untouched.
   * 
   * The contract records the preference; it does not enforce it. There is no
   * on-chain compound entrypoint to gate — yield re-supply is a pool-level
   * `allocate`, and a pooled bucket cannot attribute it per depositor without
   * per-depositor accounting the vault does not keep. The keeper reads this and
   * skips compound for depositors who are off (STE-40), fail-closed.
   */
  set_auto_compound: ({depositor, enabled}: {depositor: string, enabled: boolean}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a set_policy_consent transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Record the one-time safety-mandate consent (KTD3). Idempotent; no tier arg.
   * Emits `ConsentSet` only on the absent→set transition — the mandate is a real
   * user action (signed + paid), so it becomes a "Yours" activity row; a re-call
   * is a genuine no-op and emits nothing so the feed can't double.
   */
  set_policy_consent: ({depositor}: {depositor: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a set_configured_pool transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Record a currency bucket's advisory target pool — an off-chain hint the
   * backend/demo reads (and the U21 risky-pool re-target seam). Where funds may
   * actually go is enforced by the allowlist (`set_pool_allowed`), not here.
   * Admin-only.
   */
  set_configured_pool: ({currency, pool}: {currency: Currency, pool: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a auto_compound_enabled transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Whether the depositor wants rewards auto-compounded. Unset reads `true`.
   */
  auto_compound_enabled: ({depositor}: {depositor: string}, options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

}
export class Client extends ContractClient {
  static async deploy<T = Client>(
        /** Constructor/Initialization Args for the contract's `__constructor` method */
        {admin, keeper, config}: {admin: string, keeper: string, config: Config},
    /** Options for initializing a Client as well as for calling a method, with extras specific to deploying. */
    options: MethodOptions &
      Omit<ContractClientOptions, "contractId"> & {
        /** The hash of the Wasm blob, which must already be installed on-chain. */
        wasmHash: Buffer | string;
        /** Salt used to generate the contract's ID. Passed through to {@link Operation.createCustomContract}. Default: random. */
        salt?: Buffer | Uint8Array;
        /** The format used to decode `wasmHash`, if it's provided as a string. */
        format?: "hex" | "base64";
      }
  ): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy({admin, keeper, config}, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAAAAAAAEFFbWVyZ2VuY3kgZ2xvYmFsIHBhdXNlIG9mIHN0YXRlLWNoYW5naW5nIGVudHJ5cG9pbnRzLiBBZG1pbi1vbmx5LgAAAAAAAAVwYXVzZQAAAAAAAAAAAAAA",
        "AAAAAAAAAFFQcm90ZWN0aXZlIGZyZWV6ZSDigJQgYmxvY2tzIGZsb3dzIGludG8gYHBvb2xgIHdpdGhvdXQgbW92aW5nIGZ1bmRzLiBLZWVwZXItb25seS4AAAAAAAAGZnJlZXplAAAAAAABAAAAAAAAAARwb29sAAAAEwAAAAA=",
        "AAAAAAAAAJVEZXBvc2l0IGBhbW91bnRgIG9mIHRoZSBjdXJyZW5jeSdzIHN0YWJsZWNvaW4gaW50byB0aGF0IGJ1Y2tldC4gUmVxdWlyZXMKcHJpb3IgY29uc2VudCAoS1RELVNDMiksIHNvIGV2ZXJ5IHByaW5jaXBhbCBpbiBhIHBvb2xlZCBidWNrZXQgaXMgY29uc2VudGVkLgAAAAAAAAdkZXBvc2l0AAAAAAMAAAAAAAAACWRlcG9zaXRvcgAAAAAAABMAAAAAAAAACGN1cnJlbmN5AAAH0AAAAAhDdXJyZW5jeQAAAAAAAAAGYW1vdW50AAAAAAALAAAAAA==",
        "AAAAAAAAACJMaWZ0IHRoZSBnbG9iYWwgcGF1c2UuIEFkbWluLW9ubHkuAAAAAAAHdW5wYXVzZQAAAAAAAAAAAA==",
        "AAAAAAAAAWVSZXBsYWNlIHRoZSBjb250cmFjdCdzIFdBU00gd2l0aCBhIG5ldyBidWlsZCAoYWRtaW4tZ292ZXJuZWQgdXBncmFkZSkuClN0b3JhZ2UgaXMgcHJlc2VydmVkIOKAlCBvbmx5IGNvZGUgY2hhbmdlcyDigJQgc28gYnVnIGZpeGVzIGFuZCB0aGUgZGVmZXJyZWQKZmVhdHVyZXMgKHJlYWwtQmxlbmQgQUJJLCBtYXJrLXRvLW1hcmtldCBOQVYpIGNhbiBzaGlwIHdpdGhvdXQgbWlncmF0aW5nCmZ1bmRzLiBBZG1pbi1vbmx5OyBhIGNvbXByb21pc2VkIGFkbWluIGNvdWxkIHN3YXAgbG9naWMsIHNvIHByb2R1Y3Rpb24Kc2hvdWxkIG1vdmUgdGhpcyBiZWhpbmQgYSB0aW1lbG9jay9tdWx0aXNpZyAoZGVmZXJyZWQsIHNlZSBwbGFuKS4AAAAAAAAHdXBncmFkZQAAAAABAAAAAAAAAA1uZXdfd2FzbV9oYXNoAAAAAAAD7gAAACAAAAAA",
        "AAAAAAAAANVTdXBwbHkgcG9vbGVkIGJ1Y2tldCBmdW5kcyBpbnRvIGEgcG9vbC4gS2VlcGVyLW9ubHksIGNvbnNlbnQtZ2F0ZWQgKGJ1Y2tldApoYXMgY29uc2VudGVkIGRlcG9zaXRzKTsgdGhlIGFsbG93bGlzdCAvIGZyb3plbiAvIGNhcCBndWFyZHMgYXJlIGVuZm9yY2VkIGJ5CmBzdXBwbHlfdG9fcG9vbGAgc28gZXZlcnkgaW5ib3VuZCBwYXRoIHNoYXJlcyBvbmUgZGVmaW5pdGlvbi4AAAAAAAAIYWxsb2NhdGUAAAADAAAAAAAAAARwb29sAAAAEwAAAAAAAAAIY3VycmVuY3kAAAfQAAAACEN1cnJlbmN5AAAAAAAAAAZhbW91bnQAAAAAAAsAAAAA",
        "AAAAAAAAADhMaWZ0IGEgZnJlZXplIG9uY2UgYSBwb29sIGlzIGhlYWx0aHkgYWdhaW4uIEtlZXBlci1vbmx5LgAAAAh1bmZyZWV6ZQAAAAEAAAAAAAAABHBvb2wAAAATAAAAAA==",
        "AAAAAAAAAONDdXJyZW50IGFzc2V0IHZhbHVlIG9mIGEgdXNlcidzIGJ1Y2tldCDigJQgd2hhdCBgd2l0aGRyYXdgIHdvdWxkIHJldHVybiBmb3IgdGhlCmZ1bGwgc2hhcmUgYmFsYW5jZSB0b2RheS4gRGVyaXZlZCBzdHJhaWdodCBmcm9tIE5BViByYXRoZXIgdGhhbiBjb21wb3NlZCBmcm9tCmBzaGFyZV9wcmljZWAsIHNvIHRoZSBjYWxsZXIgbmV2ZXIgZWF0cyBhIHNlY29uZCByb3VuZGluZyB0cnVuY2F0aW9uLgAAAAAIdmFsdWVfb2YAAAACAAAAAAAAAAR1c2VyAAAAEwAAAAAAAAAIY3VycmVuY3kAAAfQAAAACEN1cnJlbmN5AAAAAQAAAAs=",
        "AAAAAAAAAJNCdXJuIGBzaGFyZXNgIGZyb20gdGhlIGRlcG9zaXRvcidzIGJ1Y2tldCBhbmQgcmV0dXJuIHRoZSBzdGFibGVjb2luLgpBc3N1bWVzIHRoZSByZWRlZW1lZCB2YWx1ZSBpcyBsaXF1aWQgaW4gdGhlIHZhdWx0IChiYWNrZW5kIGRlYWxsb2NhdGVzIGZpcnN0KS4AAAAACHdpdGhkcmF3AAAAAwAAAAAAAAAJZGVwb3NpdG9yAAAAAAAAEwAAAAAAAAAIY3VycmVuY3kAAAfQAAAACEN1cnJlbmN5AAAAAAAAAAZzaGFyZXMAAAAAAAsAAAAA",
        "AAAAAAAAAElSZWdpc3RlciB0aGUgU0VQLTQxIHN0YWJsZWNvaW4gU0FDIGJhY2tpbmcgYSBjdXJyZW5jeSBidWNrZXQuIEFkbWluLW9ubHkuAAAAAAAACXNldF90b2tlbgAAAAAAAAIAAAAAAAAACGN1cnJlbmN5AAAH0AAAAAhDdXJyZW5jeQAAAAAAAAAFdG9rZW4AAAAAAAATAAAAAA==",
        "AAAAAAAAACtTaGFyZXMgdGhlIHVzZXIgaG9sZHMgaW4gYSBjdXJyZW5jeSBidWNrZXQuAAAAAApiYWxhbmNlX29mAAAAAAACAAAAAAAAAAR1c2VyAAAAEwAAAAAAAAAIY3VycmVuY3kAAAfQAAAACEN1cnJlbmN5AAAAAQAAAAs=",
        "AAAAAAAAAEFXaXRoZHJhdyBwb29sZWQgZnVuZHMgZnJvbSBhIHBvb2wgYmFjayB0byB0aGUgdmF1bHQuIEtlZXBlci1vbmx5LgAAAAAAAApkZWFsbG9jYXRlAAAAAAADAAAAAAAAAARwb29sAAAAEwAAAAAAAAAIY3VycmVuY3kAAAfQAAAACEN1cnJlbmN5AAAAAAAAAAZhbW91bnQAAAAAAAsAAAAA",
        "AAAAAAAAAENUaGUgcG9vbCBjdXJyZW50bHkgaG9sZGluZyBhIGN1cnJlbmN5IGJ1Y2tldCdzIGZ1bmRzLCBpZiBhbGxvY2F0ZWQuAAAAAAthY3RpdmVfcG9vbAAAAAABAAAAAAAAAAhjdXJyZW5jeQAAB9AAAAAIQ3VycmVuY3kAAAABAAAD6AAAABM=",
        "AAAAAAAAAEdXaGV0aGVyIHRoZSBkZXBvc2l0b3IgaGFzIHJlY29yZGVkIHRoZSBvbmUtdGltZSBzYWZldHktbWFuZGF0ZSBjb25zZW50LgAAAAALaGFzX2NvbnNlbnQAAAAAAQAAAAAAAAAJZGVwb3NpdG9yAAAAAAAAEwAAAAEAAAAB",
        "AAAAAAAAADpXaGV0aGVyIGEgcG9vbCBpcyBhY2NlcHRpbmcgZmxvd3Mgb3IgZnJvemVuIGJ5IHRoZSBrZWVwZXIuAAAAAAALcG9vbF9zdGF0dXMAAAAAAQAAAAAAAAAEcG9vbAAAABMAAAABAAAH0AAAAApQb29sU3RhdHVzAAA=",
        "AAAAAAAAAPpOQVYgcGVyIHNoYXJlIGZvciBhIGN1cnJlbmN5IGJ1Y2tldCwgc2NhbGVkIGJ5IGBTSEFSRV9QUklDRV9TQ0FMRWAgKFIxMikuIEEKYnVja2V0IHdpdGggbm8gYWNjcnVlZCB5aWVsZCBwcmljZXMgYXQgZXhhY3RseSB0aGUgc2NhbGUuIFRoZSBiYWNrZW5kIGVhcm5pbmdzCnN1cmZhY2VzIHJlYWQgdGhpcyB0byB0dXJuIHNoYXJlcyBpbnRvIGFuIGFzc2V0IHZhbHVlLCBzaW5jZSBgYmFsYW5jZV9vZmAKcmVwb3J0cyBzaGFyZXMgYWxvbmUuAAAAAAALc2hhcmVfcHJpY2UAAAAAAQAAAAAAAAAIY3VycmVuY3kAAAfQAAAACEN1cnJlbmN5AAAAAQAAAAs=",
        "AAAAAAAAALRBcHByb3ZlIGEga2VlcGVyLXByb3Bvc2VkIHNhZmUgZXhpdCBhZnRlciBhIGZyZWV6ZSwgbW92aW5nIHRoZSBidWNrZXQncwpmdW5kcyB0byB0aGUgc2FmZSBwb29sLiBCb3VuZCB0byBhIHN0YWtlaG9sZGVyOiB0aGUgY2FsbGVyIG11c3QgaG9sZCBzaGFyZXMKaW4gdGhlIGV4aXRpbmcgYnVja2V0IChLVEQtU0M1KS4AAAAMYXBwcm92ZV9leGl0AAAAAgAAAAAAAAAJZGVwb3NpdG9yAAAAAAAAEwAAAAAAAAAHZXhpdF9pZAAAAAAGAAAAAA==",
        "AAAAAAAAADtBIHBlbmRpbmcgc2FmZS1leGl0IHByb3Bvc2FsIGZvciBhIGN1cnJlbmN5IGJ1Y2tldCwgaWYgYW55LgAAAAAMcGVuZGluZ19leGl0AAAAAQAAAAAAAAAIY3VycmVuY3kAAAfQAAAACEN1cnJlbmN5AAAAAQAAA+gAAAfQAAAADEV4aXRQcm9wb3NhbA==",
        "AAAAAAAAACpXaGV0aGVyIGEgcG9vbCBpcyBpbiB0aGUgYWxsb3dsaXN0IChyZWFkKS4AAAAAAAxwb29sX2FsbG93ZWQAAAABAAAAAAAAAARwb29sAAAAEwAAAAEAAAAB",
        "AAAAAAAAAHZSZWNvcmQgYSBrZWVwZXItcHJvcG9zZWQgc2FmZSBleGl0IGZvciBhIGZyb3plbiBidWNrZXQ7IGEgZGVwb3NpdG9yIGFwcHJvdmVzCml0IGxhdGVyIHZpYSBgYXBwcm92ZV9leGl0YC4gS2VlcGVyLW9ubHkuAAAAAAAMcHJvcG9zZV9leGl0AAAAAwAAAAAAAAAIY3VycmVuY3kAAAfQAAAACEN1cnJlbmN5AAAAAAAAAAlmcm9tX3Bvb2wAAAAAAAATAAAAAAAAAAd0b19wb29sAAAAABMAAAAA",
        "AAAAAAAAAP1BdG9taWMgZGVwbG95LXRpbWUgc2V0dXAgKHJ1bnMgb25jZSwgaW5zaWRlIHRoZSBkZXBsb3kgdHJhbnNhY3Rpb24g4oCUIG5vCnNlcGFyYXRlIGluaXQgY2FsbCwgc28gaXQgY2Fubm90IGJlIGZyb250LXJ1bikuIFNldHMgYWRtaW4gKGNvbmZpZwphdXRob3JpdHkpLCBrZWVwZXIgKFNlbnRpbmVsL2FnZW50IHJvbGUpLCBhbmQgY29uZmlnIChwZXItcG9vbCBjYXAsIG1pbgpmaXJzdCBkZXBvc2l0LCB2aXJ0dWFsLW9mZnNldCBjb25zdGFudCkuAAAAAAAADV9fY29uc3RydWN0b3IAAAAAAAADAAAAAAAAAAVhZG1pbgAAAAAAABMAAAAAAAAABmtlZXBlcgAAAAAAEwAAAAAAAAAGY29uZmlnAAAAAAfQAAAABkNvbmZpZwAAAAAAAA==",
        "AAAAAAAAAEJUaGUgY29uZmlndXJlZC90YXJnZXQgcG9vbCBmb3IgYSBidWNrZXQgKHRoZSBkZW1vIHJlLXRhcmdldCBzZWFtKS4AAAAAAA9jb25maWd1cmVkX3Bvb2wAAAAAAQAAAAAAAAAIY3VycmVuY3kAAAfQAAAACEN1cnJlbmN5AAAAAQAAA+gAAAAT",
        "AAAAAAAAAQpBZGQgb3IgcmVtb3ZlIGEgcG9vbCBmcm9tIHRoZSBvbi1jaGFpbiBhbGxvd2xpc3Qg4oCUIHRoZSBTZW50aW5lbC12ZXR0ZWQgU2FmZQpzZXQgdGhhdCBldmVyeSBgYWxsb2NhdGVgL2V4aXQgZGVzdGluYXRpb24gaXMgY2hlY2tlZCBhZ2FpbnN0IChLVEQtU0MxKS4gVGhpcwppcyB0aGUgb24tY2hhaW4gYmFja3N0b3A6IGV2ZW4gYSBjb21wcm9taXNlZCBrZWVwZXIgY2FuIG9ubHkgbW92ZSBmdW5kcyBpbnRvCmFuIGFkbWluLXZldHRlZCBwb29sLiBBZG1pbi1vbmx5LgAAAAAAEHNldF9wb29sX2FsbG93ZWQAAAACAAAAAAAAAARwb29sAAAAEwAAAAAAAAAHYWxsb3dlZAAAAAABAAAAAA==",
        "AAAAAAAAA05UdXJuIHRoZSBkZXBvc2l0b3IncyBhdXRvLWNvbXBvdW5kIChyZWludmVzdC1yZXdhcmRzKSBwcmVmZXJlbmNlIG9uIG9yIG9mZi4KSWRlbXBvdGVudC4gVGhpcyBpcyBhbiAqZWNvbm9taWMqIHByZWZlcmVuY2UsIGRlbGliZXJhdGVseSBub3QgcGFydCBvZiB0aGUKc2FmZXR5IG1hbmRhdGU6IGBzZXRfcG9saWN5X2NvbnNlbnRgIHN0YXlzIHdob2xlIGFuZCB1bnJldm9jYWJsZSwgYmVjYXVzZSBhCmJ1Y2tldCBpcyBwb29sZWQgYW5kIGEgcmV2b2tlZCBjb25zZW50IHdvdWxkIGxlYXZlIHRoZSBrZWVwZXIgdW5hYmxlIHRvIHRlbGwKb25lIGRlcG9zaXRvcidzIHNoYXJlcyBmcm9tIHRoZSByZXN0IChTVEUtMzggb3BzaSAyLCBLVEQzICsgS1RELVNDMiBpbnRhY3QpLgpUdXJuaW5nIGl0IG9mZiBzdG9wcyByZWludmVzdG1lbnQgb25seSDigJQgYWxsb2NhdGUsIHJlYmFsYW5jZSwgYW5kIHRoZQpmcmVlemUtZXhpdCBwYXRoIGFyZSB1bnRvdWNoZWQuCgpUaGUgY29udHJhY3QgcmVjb3JkcyB0aGUgcHJlZmVyZW5jZTsgaXQgZG9lcyBub3QgZW5mb3JjZSBpdC4gVGhlcmUgaXMgbm8Kb24tY2hhaW4gY29tcG91bmQgZW50cnlwb2ludCB0byBnYXRlIOKAlCB5aWVsZCByZS1zdXBwbHkgaXMgYSBwb29sLWxldmVsCmBhbGxvY2F0ZWAsIGFuZCBhIHBvb2xlZCBidWNrZXQgY2Fubm90IGF0dHJpYnV0ZSBpdCBwZXIgZGVwb3NpdG9yIHdpdGhvdXQKcGVyLWRlcG9zaXRvciBhY2NvdW50aW5nIHRoZSB2YXVsdCBkb2VzIG5vdCBrZWVwLiBUaGUga2VlcGVyIHJlYWRzIHRoaXMgYW5kCnNraXBzIGNvbXBvdW5kIGZvciBkZXBvc2l0b3JzIHdobyBhcmUgb2ZmIChTVEUtNDApLCBmYWlsLWNsb3NlZC4AAAAAABFzZXRfYXV0b19jb21wb3VuZAAAAAAAAAIAAAAAAAAACWRlcG9zaXRvcgAAAAAAABMAAAAAAAAAB2VuYWJsZWQAAAAAAQAAAAA=",
        "AAAAAAAAAShSZWNvcmQgdGhlIG9uZS10aW1lIHNhZmV0eS1tYW5kYXRlIGNvbnNlbnQgKEtURDMpLiBJZGVtcG90ZW50OyBubyB0aWVyIGFyZy4KRW1pdHMgYENvbnNlbnRTZXRgIG9ubHkgb24gdGhlIGFic2VudOKGknNldCB0cmFuc2l0aW9uIOKAlCB0aGUgbWFuZGF0ZSBpcyBhIHJlYWwKdXNlciBhY3Rpb24gKHNpZ25lZCArIHBhaWQpLCBzbyBpdCBiZWNvbWVzIGEgIllvdXJzIiBhY3Rpdml0eSByb3c7IGEgcmUtY2FsbAppcyBhIGdlbnVpbmUgbm8tb3AgYW5kIGVtaXRzIG5vdGhpbmcgc28gdGhlIGZlZWQgY2FuJ3QgZG91YmxlLgAAABJzZXRfcG9saWN5X2NvbnNlbnQAAAAAAAEAAAAAAAAACWRlcG9zaXRvcgAAAAAAABMAAAAA",
        "AAAAAAAAAOpSZWNvcmQgYSBjdXJyZW5jeSBidWNrZXQncyBhZHZpc29yeSB0YXJnZXQgcG9vbCDigJQgYW4gb2ZmLWNoYWluIGhpbnQgdGhlCmJhY2tlbmQvZGVtbyByZWFkcyAoYW5kIHRoZSBVMjEgcmlza3ktcG9vbCByZS10YXJnZXQgc2VhbSkuIFdoZXJlIGZ1bmRzIG1heQphY3R1YWxseSBnbyBpcyBlbmZvcmNlZCBieSB0aGUgYWxsb3dsaXN0IChgc2V0X3Bvb2xfYWxsb3dlZGApLCBub3QgaGVyZS4KQWRtaW4tb25seS4AAAAAABNzZXRfY29uZmlndXJlZF9wb29sAAAAAAIAAAAAAAAACGN1cnJlbmN5AAAH0AAAAAhDdXJyZW5jeQAAAAAAAAAEcG9vbAAAABMAAAAA",
        "AAAAAAAAAEhXaGV0aGVyIHRoZSBkZXBvc2l0b3Igd2FudHMgcmV3YXJkcyBhdXRvLWNvbXBvdW5kZWQuIFVuc2V0IHJlYWRzIGB0cnVlYC4AAAAVYXV0b19jb21wb3VuZF9lbmFibGVkAAAAAAAAAQAAAAAAAAAJZGVwb3NpdG9yAAAAAAAAEwAAAAEAAAAB",
        "AAAABAAAAIpUeXBlZCBwYW5pY3MuIGAjW2NvbnRyYWN0ZXJyb3JdYCBsZXRzIHRlc3RzIGFzc2VydCB0aGUgZXhhY3QgZmFpbHVyZSB2aWEgdGhlCmB0cnlfKmAgY2xpZW50IGVudHJ5cG9pbnRzIGluc3RlYWQgb2YgbWF0Y2hpbmcgcGFuaWMgc3RyaW5ncy4AAAAAAAAAAAAFRXJyb3IAAAAAAAAOAAAAAAAAAAZQYXVzZWQAAAAAAAEAAAAAAAAAC1Rva2VuTm90U2V0AAAAAAIAAAAAAAAACU5vQ29uc2VudAAAAAAAAAMAAAAAAAAAEU5vblBvc2l0aXZlQW1vdW50AAAAAAAABAAAAAAAAAAUQmVsb3dNaW5GaXJzdERlcG9zaXQAAAAFAAAAAAAAABJJbnN1ZmZpY2llbnRTaGFyZXMAAAAAAAYAAAAAAAAAClBvb2xGcm96ZW4AAAAAAAcAAAAAAAAAC0NhcEV4Y2VlZGVkAAAAAAgAAAAAAAAAFEluc3VmZmljaWVudEhvbGRpbmdzAAAACQAAAAAAAAALRW1wdHlCdWNrZXQAAAAACgAAAAAAAAANTm9QZW5kaW5nRXhpdAAAAAAAAAsAAAAAAAAAD05vdEFTdGFrZWhvbGRlcgAAAAAMAAAARFRhcmdldCBwb29sIGlzIG5vdCBpbiB0aGUgYWRtaW4tdmV0dGVkIFNhZmUgc2V0IChLVEQtU0MxIGFsbG93bGlzdCkuAAAADlBvb2xOb3RBbGxvd2VkAAAAAAANAAAAQkEgZnJlZXplLWV4aXQgd2FzIGFwcHJvdmVkIGZvciBhIHBvb2wgdGhhdCBpcyBub3QgYWN0dWFsbHkgZnJvemVuLgAAAAAAD1NvdXJjZU5vdEZyb3plbgAAAAAO",
        "AAAAAQAAAMJJbnN0YW5jZSBjb25maWcgc2V0IGF0IGBpbml0YC4gUG9vbCBhZGRyZXNzZXMgbGl2ZSBpbiB0aGVpciBvd24gcGVyLWN1cnJlbmN5CnN0b3JhZ2UgKHNldCB2aWEgYHNldF9jb25maWd1cmVkX3Bvb2xgKSBzbyBhIGJ1Y2tldCBjYW4gYmUgcmUtcG9pbnRlZCB3aXRob3V0CnJlLWRlcGxveWluZyAodGhlIFUyMSByaXNreS1wb29sIHNlYW0pLgAAAAAAAAAAAAZDb25maWcAAAAAAAMAAABOTWluaW11bSBmaXJzdCBkZXBvc2l0IGludG8gYW4gZW1wdHkgYnVja2V0IChzZWNvbmRhcnkgaW5mbGF0aW9uLWF0dGFjayBndWFyZCkuAAAAAAARbWluX2ZpcnN0X2RlcG9zaXQAAAAAAAALAAAAUU1heCBob2xkaW5ncyBhIHNpbmdsZSBwb29sIG1heSBob2xkLCBwZXIgcG9vbCAoZ3VhcmQgYWdhaW5zdCBvdmVyLWNvbmNlbnRyYXRpb24pLgAAAAAAAAxwZXJfcG9vbF9jYXAAAAALAAAAT1ZpcnR1YWwgc2hhcmVzL2Fzc2V0cyBvZmZzZXQgZGVmZWF0aW5nIHRoZSBkb25hdGlvbi1pbmZsYXRpb24gYXR0YWNrIChLVEQtU0MzKS4AAAAADnZpcnR1YWxfb2Zmc2V0AAAAAAAL",
        "AAAAAgAAAHJCdWNrZXQgZGVub21pbmF0aW9uLiBPbmUgYnVja2V0IHBlciBjdXJyZW5jeSB0aGUgZGVwb3NpdG9yIGFjdHVhbGx5IGZ1bmRlZCDigJQKbmV2ZXIgc3BsaXQgb3IgY29udmVydGVkIChSMywgUjIzKS4AAAAAAAAAAAAIQ3VycmVuY3kAAAADAAAAAAAAAAAAAAADVXNkAAAAAAAAAAAAAAAAA0V1cgAAAAAAAAAAAAAAAANNeG4A",
        "AAAAAgAAAExQb29sIGxpZmVjeWNsZSBzdGF0dXMsIG1hdGNoaW5nIHRoZSBpbnRlcmZhY2UncyBgJ2FjdGl2ZScgfCAnZnJvemVuJ2AgdW5pb24uAAAAAAAAAApQb29sU3RhdHVzAAAAAAACAAAAAAAAAAAAAAAGQWN0aXZlAAAAAAAAAAAAAAAAAAZGcm96ZW4AAA==",
        "AAAAAQAAAFRBIGtlZXBlci1wcm9wb3NlZCBzYWZlIGV4aXQgYWZ0ZXIgYSBTZW50aW5lbCBmcmVlemU7IHRoZSBkZXBvc2l0b3IgYXBwcm92ZXMgaXQgKEYzKS4AAAAAAAAADEV4aXRQcm9wb3NhbAAAAAQAAAAAAAAACGN1cnJlbmN5AAAH0AAAAAhDdXJyZW5jeQAAAAAAAAAJZnJvbV9wb29sAAAAAAAAEwAAAAAAAAACaWQAAAAAAAYAAAAAAAAAB3RvX3Bvb2wAAAAAEw==",
        "AAAABQAAAAAAAAAAAAAABkZyb3plbgAAAAAAAQAAAAZmcm96ZW4AAAAAAAEAAAAAAAAABHBvb2wAAAATAAAAAQAAAAI=",
        "AAAABQAAAAAAAAAAAAAAB0RlcG9zaXQAAAAAAQAAAAdkZXBvc2l0AAAAAAQAAAAAAAAACWRlcG9zaXRvcgAAAAAAABMAAAABAAAAAAAAAAhjdXJyZW5jeQAAB9AAAAAIQ3VycmVuY3kAAAAAAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAAAAAAAAAAAAZzaGFyZXMAAAAAAAsAAAAAAAAAAg==",
        "AAAABQAAAAAAAAAAAAAACFVuZnJvemVuAAAAAQAAAAh1bmZyb3plbgAAAAEAAAAAAAAABHBvb2wAAAATAAAAAQAAAAI=",
        "AAAABQAAAAAAAAAAAAAACFdpdGhkcmF3AAAAAQAAAAh3aXRoZHJhdwAAAAQAAAAAAAAACWRlcG9zaXRvcgAAAAAAABMAAAABAAAAAAAAAAhjdXJyZW5jeQAAB9AAAAAIQ3VycmVuY3kAAAAAAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAAAAAAAAAAAAZzaGFyZXMAAAAAAAsAAAAAAAAAAg==",
        "AAAABQAAAAAAAAAAAAAACUFsbG9jYXRlZAAAAAAAAAEAAAAJYWxsb2NhdGVkAAAAAAAAAwAAAAAAAAAIY3VycmVuY3kAAAfQAAAACEN1cnJlbmN5AAAAAQAAAAAAAAAEcG9vbAAAABMAAAAAAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAAAAAAAg==",
        "AAAABQAAAhZFbWl0dGVkIHRoZSBmaXJzdCB0aW1lIGEgZGVwb3NpdG9yIHJlY29yZHMgdGhlIG9uZS10aW1lIHNhZmV0eSBtYW5kYXRlCih0aGUgYWJzZW504oaSc2V0IHRyYW5zaXRpb24pLiBTYW1lIHByaW5jaXBsZSBhcyBgQXV0b0NvbXBvdW5kU2V0YDogdGhlIGRlcG9zaXRvcgpzaWducyBhbmQgcGF5cyBmb3IgYHNldF9wb2xpY3lfY29uc2VudGAsIHNvIHRoZSBmcm9udGVuZCBkZXJpdmVzIGEgIlNpZ25lZAphdXRvLW9wdGltaXplIG1hbmRhdGUiIGFjdGl2aXR5IHJvdyBmcm9tIHRoaXMgZXZlbnQuIENvbnNlbnQgaXMgaWRlbXBvdGVudCBhbmQKdW5yZXZvY2FibGUsIHNvIHdlIGVtaXQgZXhhY3RseSBvbmNlIOKAlCBhIHJlLWNhbGwgaXMgYSBnZW51aW5lIG5vLW9wIGFuZCBlbWl0cwpub3RoaW5nLCBrZWVwaW5nIHRoZSBsaXZlIGZlZWQgZnJvbSBkb3VibGluZy4gUGF5bG9hZCBpcyBqdXN0IHRoZSBkZXBvc2l0b3IKKG5vIHRpZXIsIG5vIGZsYWcg4oCUIGNvbnNlbnQgaGFzIG5vIHBhcmFtZXRlcnMgYW5kIGNhbm5vdCBiZSByZXZva2VkKS4AAAAAAAAAAAAKQ29uc2VudFNldAAAAAAAAQAAAAtjb25zZW50X3NldAAAAAABAAAAAAAAAAlkZXBvc2l0b3IAAAAAAAATAAAAAQAAAAI=",
        "AAAABQAAAAAAAAAAAAAAC0RlYWxsb2NhdGVkAAAAAAEAAAALZGVhbGxvY2F0ZWQAAAAAAwAAAAAAAAAIY3VycmVuY3kAAAfQAAAACEN1cnJlbmN5AAAAAQAAAAAAAAAEcG9vbAAAABMAAAAAAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAAAAAAAg==",
        "AAAABQAAAAAAAAAAAAAADEV4aXRBcHByb3ZlZAAAAAEAAAANZXhpdF9hcHByb3ZlZAAAAAAAAAIAAAAAAAAACGN1cnJlbmN5AAAH0AAAAAhDdXJyZW5jeQAAAAEAAAAAAAAAAmlkAAAAAAAGAAAAAAAAAAI=",
        "AAAABQAAAAAAAAAAAAAADEV4aXRQcm9wb3NlZAAAAAEAAAANZXhpdF9wcm9wb3NlZAAAAAAAAAIAAAAAAAAACGN1cnJlbmN5AAAH0AAAAAhDdXJyZW5jeQAAAAEAAAAAAAAAAmlkAAAAAAAGAAAAAAAAAAI=",
        "AAAABQAAAN5FbWl0dGVkIG9uIGV2ZXJ5IGBzZXRfYXV0b19jb21wb3VuZGAsIGluY2x1ZGluZyBhIHJlLXNldCB0byB0aGUgc2FtZSB2YWx1ZSDigJQKdGhlIGZyb250ZW5kIGRlcml2ZXMgdGhlICJZb3VycyIgYWN0aXZpdHkgcm93IGZyb20gdGhpcywgc28gYSBzaWxlbnQgbm8tb3AKd291bGQgZHJvcCBhIHVzZXIgYWN0aW9uIHRoZSBkZXBvc2l0b3IgYWN0dWFsbHkgc2lnbmVkIGFuZCBwYWlkIGZvci4AAAAAAAAAAAAPQXV0b0NvbXBvdW5kU2V0AAAAAAEAAAARYXV0b19jb21wb3VuZF9zZXQAAAAAAAACAAAAAAAAAAlkZXBvc2l0b3IAAAAAAAATAAAAAQAAAAAAAAAHZW5hYmxlZAAAAAABAAAAAAAAAAI=",
        "AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAAEQAAAAAAAAAAAAAABUFkbWluAAAAAAAAAAAAAAAAAAAGS2VlcGVyAAAAAAAAAAAAAAAAAAZDb25maWcAAAAAAAAAAAAAAAAABlBhdXNlZAAAAAAAAAAAAAAAAAALRXhpdENvdW50ZXIAAAAAAQAAAAAAAAAFVG9rZW4AAAAAAAABAAAH0AAAAAhDdXJyZW5jeQAAAAEAAAAAAAAADkNvbmZpZ3VyZWRQb29sAAAAAAABAAAH0AAAAAhDdXJyZW5jeQAAAAEAAAAAAAAAC0FsbG93ZWRQb29sAAAAAAEAAAATAAAAAQAAAAAAAAAGU2hhcmVzAAAAAAACAAAAEwAAB9AAAAAIQ3VycmVuY3kAAAABAAAAAAAAAAtUb3RhbFNoYXJlcwAAAAABAAAH0AAAAAhDdXJyZW5jeQAAAAEAAAAAAAAAC1RvdGFsQXNzZXRzAAAAAAEAAAfQAAAACEN1cnJlbmN5AAAAAQAAAAAAAAAKQWN0aXZlUG9vbAAAAAAAAQAAB9AAAAAIQ3VycmVuY3kAAAABAAAAAAAAAAxQb29sSG9sZGluZ3MAAAACAAAH0AAAAAhDdXJyZW5jeQAAABMAAAABAAAAAAAAAAdDb25zZW50AAAAAAEAAAATAAAAAQAAAAAAAAAMQXV0b0NvbXBvdW5kAAAAAQAAABMAAAABAAAAAAAAAAZGcm96ZW4AAAAAAAEAAAATAAAAAQAAAAAAAAALUGVuZGluZ0V4aXQAAAAAAQAAB9AAAAAIQ3VycmVuY3k=" ]),
      options
    )
  }
  public readonly fromJSON = {
    pause: this.txFromJSON<null>,
        freeze: this.txFromJSON<null>,
        deposit: this.txFromJSON<null>,
        unpause: this.txFromJSON<null>,
        upgrade: this.txFromJSON<null>,
        allocate: this.txFromJSON<null>,
        unfreeze: this.txFromJSON<null>,
        value_of: this.txFromJSON<i128>,
        withdraw: this.txFromJSON<null>,
        set_token: this.txFromJSON<null>,
        balance_of: this.txFromJSON<i128>,
        deallocate: this.txFromJSON<null>,
        active_pool: this.txFromJSON<Option<string>>,
        has_consent: this.txFromJSON<boolean>,
        pool_status: this.txFromJSON<PoolStatus>,
        share_price: this.txFromJSON<i128>,
        approve_exit: this.txFromJSON<null>,
        pending_exit: this.txFromJSON<Option<ExitProposal>>,
        pool_allowed: this.txFromJSON<boolean>,
        propose_exit: this.txFromJSON<null>,
        configured_pool: this.txFromJSON<Option<string>>,
        set_pool_allowed: this.txFromJSON<null>,
        set_auto_compound: this.txFromJSON<null>,
        set_policy_consent: this.txFromJSON<null>,
        set_configured_pool: this.txFromJSON<null>,
        auto_compound_enabled: this.txFromJSON<boolean>
  }
}