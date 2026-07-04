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
/// Enforces the shared inbound guards — allowlist, frozen flag, per-pool cap — and
/// writes state before the external calls (checks-effects-interactions).
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
    // Effects before interactions: book holdings + active pool first, so a
    // re-entrant call cannot observe a stale cap.
    storage::set_pool_holdings(env, currency, pool, new_holdings);
    storage::set_active_pool(env, currency, pool);
    // Interactions.
    let vault = env.current_contract_address();
    token::Client::new(env, &require_token(env, currency)).transfer(&vault, pool, &amount);
    PoolClient::new(env, pool).supply(&vault, &amount);
}

/// Pull `amount` of `currency` back from `pool` to the vault; clear the active
/// pool when the bucket's holdings in it reach zero.
pub fn withdraw_from_pool(env: &Env, pool: &Address, currency: Currency, amount: i128) {
    let remaining = storage::get_pool_holdings(env, currency, pool) - amount;
    storage::set_pool_holdings(env, currency, pool, remaining);
    if remaining == 0 && storage::get_active_pool(env, currency).as_ref() == Some(pool) {
        storage::clear_active_pool(env, currency);
    }
    let vault = env.current_contract_address();
    PoolClient::new(env, pool).withdraw(&vault, &amount);
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
    let amount = storage::get_pool_holdings(env, currency, &proposal.from_pool);
    if amount <= 0 {
        panic_with_error!(env, Error::InsufficientHoldings);
    }
    // Pull from the frozen pool, then push into the safe pool (allowlist + cap
    // + not-frozen enforced by supply_to_pool).
    withdraw_from_pool(env, &proposal.from_pool, currency, amount);
    supply_to_pool(env, &proposal.to_pool, currency, amount);
}
