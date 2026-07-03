//! Allocation helpers: move pooled bucket funds into/out of a Blend pool, and
//! execute an approved safe exit (U4, KTD-SC1/KTD-SC5).
//!
//! Token model (test-double faithful; real Blend adapted behind `blend.rs` at
//! integration): `allocate` pushes the stablecoin from the vault to the pool
//! address (a contract moving its own funds needs no extra auth) and then calls
//! `supply` to book it; `deallocate`/exit call `withdraw` to pull it back. The
//! entrypoints (`allocate`/`deallocate`/`approve_exit`) live in `lib.rs`; the
//! reusable movement logic lives here.

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
pub fn supply_to_pool(env: &Env, pool: &Address, currency: Currency, amount: i128) {
    let token = require_token(env, currency);
    let vault = env.current_contract_address();
    token::Client::new(env, &token).transfer(&vault, pool, &amount);
    PoolClient::new(env, pool).supply(&vault, &amount);
    let holdings = storage::get_pool_holdings(env, pool) + amount;
    storage::set_pool_holdings(env, pool, holdings);
    storage::set_active_pool(env, currency, pool);
}

/// Pull `amount` back from `pool` to the vault and decrement its booked holdings.
pub fn withdraw_from_pool(env: &Env, pool: &Address, amount: i128) {
    let vault = env.current_contract_address();
    PoolClient::new(env, pool).withdraw(&vault, &amount);
    let holdings = storage::get_pool_holdings(env, pool) - amount;
    storage::set_pool_holdings(env, pool, holdings);
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
/// `to_pool`. The sanctioned escape hatch — it may leave a frozen pool.
pub fn execute_exit(env: &Env, currency: Currency, proposal: &ExitProposal) {
    if storage::is_frozen(env, &proposal.to_pool) {
        panic_with_error!(env, Error::PoolFrozen);
    }
    let amount = storage::get_pool_holdings(env, &proposal.from_pool);
    if amount > 0 {
        let token = require_token(env, currency);
        let vault = env.current_contract_address();
        // Pull from the frozen pool back to the vault…
        PoolClient::new(env, &proposal.from_pool).withdraw(&vault, &amount);
        storage::set_pool_holdings(env, &proposal.from_pool, 0);
        // …then push into the safe pool.
        token::Client::new(env, &token).transfer(&vault, &proposal.to_pool, &amount);
        PoolClient::new(env, &proposal.to_pool).supply(&vault, &amount);
        let to_holdings = storage::get_pool_holdings(env, &proposal.to_pool) + amount;
        storage::set_pool_holdings(env, &proposal.to_pool, to_holdings);
        storage::set_active_pool(env, currency, &proposal.to_pool);
    }
}
