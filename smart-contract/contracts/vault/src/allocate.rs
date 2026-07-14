//! Allocation helpers: move pooled bucket funds into/out of a Blend pool, and
//! execute an approved safe exit (U4, KTD-SC1/KTD-SC5).
//!
//! Token model (test-double faithful; real Blend adapted behind `blend.rs` at
//! integration): `supply_to_pool` pushes the stablecoin from the vault to the
//! pool address (a contract moving its own funds needs no extra auth) and books
//! it; `withdraw_from_pool`/exit pull it back. Every inbound move is gated on the
//! on-chain allowlist, the frozen flag, and the per-pool cap (KTD-SC1/KTD-SC4) so
//! the guards hold no matter which entrypoint calls in. Holdings are keyed by
//! `(currency, pool)` so per-currency accounting never conflates. The entrypoints
//! (`allocate`/`deallocate`/`approve_exit`) live in `lib.rs`.

use soroban_sdk::{panic_with_error, token, Address, Env};

use crate::blend::PoolClient;
use crate::storage;
use crate::types::{Currency, Error, ExitProposal};

/// Every bucket denomination — used to locate a pending exit by id.
pub fn all_currencies() -> [Currency; 3] {
    [Currency::Usd, Currency::Eur, Currency::Mxn]
}

/// Resolve a currency's stablecoin SAC or panic if unset.
pub fn require_token(env: &Env, currency: Currency) -> Address {
    match storage::get_token(env, currency) {
        Some(t) => t,
        None => panic_with_error!(env, Error::TokenNotSet),
    }
}

/// Push `amount` of `currency`'s stablecoin from the vault into `pool` and book it.
/// Enforces the shared inbound guards — allowlist, frozen flag, per-pool cap, and
/// that the bucket actually holds `amount` idle — and writes state before the
/// external calls (checks-effects-interactions).
///
/// Moves the funds out of `idle` and into the pool: NAV is unchanged the instant it
/// runs (the pool's `balance(vault)` gains exactly what idle lost), and the pool is
/// entered into the bucket's NAV list so its future accrual counts.
pub fn supply_to_pool(env: &Env, pool: &Address, currency: Currency, amount: i128) {
    if !storage::is_pool_allowed(env, pool) {
        panic_with_error!(env, Error::PoolNotAllowed);
    }
    if storage::is_frozen(env, pool) {
        panic_with_error!(env, Error::PoolFrozen);
    }
    let new_holdings = storage::get_pool_holdings(env, currency, pool) + amount;
    if new_holdings > storage::get_config(env).per_pool_cap {
        panic_with_error!(env, Error::CapExceeded);
    }
    let idle = storage::get_total_assets(env, currency);
    if amount > idle {
        panic_with_error!(env, Error::InsufficientIdle);
    }
    // Effects before interactions: move idle→pool, book holdings + active pool, and
    // enter the NAV list first, so a re-entrant call cannot observe a stale cap or a
    // pool missing from NAV.
    if !storage::add_to_pool_list(env, currency, pool) {
        panic_with_error!(env, Error::TooManyPools);
    }
    storage::set_total_assets(env, currency, idle - amount);
    storage::set_pool_holdings(env, currency, pool, new_holdings);
    storage::set_active_pool(env, currency, pool);
    // Interactions.
    let vault = env.current_contract_address();
    token::Client::new(env, &require_token(env, currency)).transfer(&vault, pool, &amount);
    PoolClient::new(env, pool).supply(&vault, &amount);
}

/// Pull `amount` of `currency` back from `pool` to the vault, crediting `idle`. The
/// per-pool holdings counter (bucket exposure, capped) drops by `amount` but floors
/// at 0 — a freeze-exit pulls the pool's whole *value* (principal + interest), which
/// can exceed booked principal. A pool leaves the NAV list only once its
/// `balance(vault)` reads 0 (its accrued interest outlives its principal, KTD5).
pub fn withdraw_from_pool(env: &Env, pool: &Address, currency: Currency, amount: i128) {
    let booked = storage::get_pool_holdings(env, currency, pool);
    let remaining = if amount > booked { 0 } else { booked - amount };
    storage::set_pool_holdings(env, currency, pool, remaining);
    storage::set_total_assets(env, currency, storage::get_total_assets(env, currency) + amount);
    let vault = env.current_contract_address();
    PoolClient::new(env, pool).withdraw(&vault, &amount);
    // Drop from NAV / active only when nothing of the position remains.
    if PoolClient::new(env, pool).balance(&vault) == 0 {
        storage::remove_from_pool_list(env, currency, pool);
        if storage::get_active_pool(env, currency).as_ref() == Some(pool) {
            storage::clear_active_pool(env, currency);
        }
    }
}

/// Pull `needed` of `currency` back into idle by draining the bucket's pools in list
/// order (KTD5 — so `withdraw` can pay out a depositor's grown value without an
/// operator deallocating first). Panics `InsufficientLiquidity` if the pools cannot
/// together cover it. Snapshots the list up front: `withdraw_from_pool` mutates it.
pub fn pull_from_pools(env: &Env, currency: Currency, needed: i128) {
    let vault = env.current_contract_address();
    let mut outstanding = needed;
    for pool in storage::get_pool_list(env, currency).iter() {
        if outstanding <= 0 {
            break;
        }
        let available = PoolClient::new(env, &pool).balance(&vault);
        if available <= 0 {
            continue;
        }
        let take = if available < outstanding { available } else { outstanding };
        withdraw_from_pool(env, &pool, currency, take);
        outstanding -= take;
    }
    if outstanding > 0 {
        panic_with_error!(env, Error::InsufficientLiquidity);
    }
}

/// Find the pending exit carrying `exit_id`, returning its currency + proposal.
pub fn find_exit(env: &Env, exit_id: u64) -> Option<(Currency, ExitProposal)> {
    for currency in all_currencies() {
        if let Some(proposal) = storage::get_pending_exit(env, currency) {
            if proposal.id == exit_id {
                return Some((currency, proposal));
            }
        }
    }
    None
}

/// Move a bucket's entire holdings from the frozen `from_pool` to the safe
/// `to_pool`. The sanctioned escape hatch — only valid when the source is
/// actually frozen; the destination is re-validated by `supply_to_pool`.
pub fn execute_exit(env: &Env, currency: Currency, proposal: &ExitProposal) {
    if !storage::is_frozen(env, &proposal.from_pool) {
        panic_with_error!(env, Error::SourceNotFrozen);
    }
    // Move the pool's whole *value* — principal **plus accrued interest** — not just
    // booked principal (KTD6), so a depositor's yield is never stranded in the
    // frozen pool. `withdraw_from_pool` credits idle by this amount; `supply_to_pool`
    // then debits idle and re-books it in the safe pool, so idle nets unchanged.
    let vault = env.current_contract_address();
    let amount = PoolClient::new(env, &proposal.from_pool).balance(&vault);
    if amount <= 0 {
        panic_with_error!(env, Error::InsufficientHoldings);
    }
    // Pull from the frozen pool, then push into the safe pool (allowlist + cap
    // + not-frozen enforced by supply_to_pool).
    withdraw_from_pool(env, &proposal.from_pool, currency, amount);
    supply_to_pool(env, &proposal.to_pool, currency, amount);
}
