//! Mark-to-market NAV (KTD-SC3, R6).
//!
//! A bucket's net asset value is what the vault still holds for it **plus what its
//! pools currently owe it**:
//!
//! ```text
//! nav(ccy) = idle(ccy) + Σ_{p ∈ PoolList(ccy)} PoolClient::new(p).balance(vault)
//! ```
//!
//! `idle` is `TotalAssets(ccy)` — historically "everything the bucket held", now
//! narrowed to "what the vault itself still holds", the two differing only once a
//! keeper allocates. Each pool term is a **valued** balance (a `yield_pool` grows it
//! with ledger time), so as pool interest accrues the share price rises without any
//! on-chain poke — that is the whole point of the upgrade.
//!
//! Why this is still donation-proof: every address in `PoolList` was put there by
//! `supply_to_pool`, which enforces the allowlist + frozen + cap guards, and each
//! pool only credits the vault's position under the vault's own auth
//! (`yield_pool`'s `from.require_auth`, KTD4). So NAV never reads a raw token
//! balance an outsider could inflate — a direct SAC donation to the vault or to a
//! pool moves neither `idle` nor any pool's booked `balance(vault)`.

use soroban_sdk::Env;

use crate::blend::PoolClient;
use crate::storage;
use crate::types::Currency;

/// The bucket's idle (un-pooled) balance — the vault's own holding for `currency`.
pub fn idle(env: &Env, currency: Currency) -> i128 {
    storage::get_total_assets(env, currency)
}

/// Net asset value of `currency`'s bucket: idle plus every pool's valued balance.
/// The list is bounded by `MAX_POOLS_PER_CURRENCY`, so this read is O(pools) with a
/// fixed ceiling.
pub fn nav(env: &Env, currency: Currency) -> i128 {
    let vault = env.current_contract_address();
    let mut total = idle(env, currency);
    for pool in storage::get_pool_list(env, currency).iter() {
        total += PoolClient::new(env, &pool).balance(&vault);
    }
    total
}
