//! Shared vault types: currency buckets, config, exit proposals, and errors.
//!
//! These mirror `packages/vault-client/src/interface.ts`. `Currency` is the
//! bucket denomination (USD/EUR/MXN); amounts and shares are `i128` (the TS
//! `bigint`); `ExitProposal` matches the interface's pending-exit shape.

use soroban_sdk::{contracterror, contracttype, Address};

/// Bucket denomination. One bucket per currency the depositor actually funded —
/// never split or converted (R3, R23).
#[contracttype]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Currency {
    Usd,
    Eur,
    Mxn,
}

/// Instance config set at `init`. Pool addresses live in their own per-currency
/// storage (set via `set_configured_pool`) so a bucket can be re-pointed without
/// re-deploying (the U21 risky-pool seam).
#[contracttype]
#[derive(Clone)]
pub struct Config {
    /// Max holdings a single pool may hold, per pool (guard against over-concentration).
    pub per_pool_cap: i128,
    /// Minimum first deposit into an empty bucket (secondary inflation-attack guard).
    pub min_first_deposit: i128,
    /// Virtual shares/assets offset defeating the donation-inflation attack (KTD-SC3).
    pub virtual_offset: i128,
}

/// Pool lifecycle status, matching the interface's `'active' | 'frozen'` union.
#[contracttype]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum PoolStatus {
    Active,
    Frozen,
}

/// A keeper-proposed safe exit after a Sentinel freeze; the depositor approves it (F3).
#[contracttype]
#[derive(Clone)]
pub struct ExitProposal {
    pub id: u64,
    pub currency: Currency,
    pub from_pool: Address,
    pub to_pool: Address,
}

/// Typed panics. `#[contracterror]` lets tests assert the exact failure via the
/// `try_*` client entrypoints instead of matching panic strings.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotAuthorized = 2, // caller is not admin
    Paused = 3,
    TokenNotSet = 4,
    NoConsent = 5,
    NonPositiveAmount = 6,
    BelowMinFirstDeposit = 7,
    InsufficientShares = 8,
    PoolFrozen = 9,
    CapExceeded = 10,
    InsufficientHoldings = 11,
    EmptyBucket = 12,
    NoPendingExit = 13,
    ExitMismatch = 14,
    NotAStakeholder = 15,
}
