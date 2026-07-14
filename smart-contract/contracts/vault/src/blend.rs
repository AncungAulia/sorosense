//! Blend pool client seam (KTD-SC1).
//!
//! The vault calls a pool through this generated client, whose contract address
//! is supplied at call time from config — so the same code targets the in-repo
//! `mock_pool` test-double in `cargo test` and a real Blend Fixed pool on testnet.
//! Real Blend's ABI (`submit`, pull-based) is adapted behind this seam at
//! integration (origin U20); the `supply`/`withdraw` shape here is what the
//! test-double implements and what the vault codes against.

use soroban_sdk::{contractclient, Address, Env};

// The trait exists only to generate `PoolClient`; the trait itself is unused.
#[allow(dead_code)]
#[contractclient(name = "PoolClient")]
pub trait BlendPool {
    /// Notify the pool of `amount` supplied by `from` (the vault). The vault has
    /// already transferred the stablecoin to the pool's address.
    fn supply(env: Env, from: Address, amount: i128);
    /// Return `amount` of the custodied stablecoin to `to` (the vault).
    fn withdraw(env: Env, to: Address, amount: i128);
    /// What `of`'s position in this pool is currently worth — principal **plus any
    /// accrued interest** (a `yield_pool` grows this with ledger time; the test-double
    /// returns booked holdings). Mark-to-market NAV sums this across the bucket's
    /// pools, so it is the load-bearing read for `share_price` (KTD-SC3, R6).
    fn balance(env: Env, of: Address) -> i128;
}
