#![no_std]
//! Blend pool **test-double** (KTD-SC1).
//!
//! A deterministic, offline stand-in for a Blend Fixed pool exposing the same
//! `supply`/`withdraw` surface the vault's `blend.rs` client calls. It lets
//! `cargo test` exercise allocate/deallocate without a live testnet dependency.
//!
//! Token model: the vault *pushes* the stablecoin to this pool's address during
//! `allocate` (a contract moving its own funds needs no extra auth), then calls
//! `supply` here as a bookkeeping notification. `withdraw` returns the pool's own
//! held tokens to the caller (the vault). Real Blend uses a pull-based `submit`;
//! that difference is adapted behind the vault's `blend.rs` seam at integration.

use soroban_sdk::{contract, contractimpl, contracttype, token, Address, Env};

#[contracttype]
enum PoolKey {
    Token,
    Holdings,
}

#[contract]
pub struct MockPool;

#[contractimpl]
impl MockPool {
    /// Set the stablecoin this pool custodies. Called once at deploy in tests.
    pub fn init(env: Env, token: Address) {
        env.storage().instance().set(&PoolKey::Token, &token);
        env.storage().instance().set(&PoolKey::Holdings, &0i128);
    }

    /// Record supplied funds. The vault has already transferred `amount` of the
    /// stablecoin to this contract's address; this call just books the credit.
    pub fn supply(env: Env, _from: Address, amount: i128) {
        let held: i128 = env
            .storage()
            .instance()
            .get(&PoolKey::Holdings)
            .unwrap_or(0);
        env.storage()
            .instance()
            .set(&PoolKey::Holdings, &(held + amount));
    }

    /// Return `amount` of the custodied stablecoin to `to` (the vault).
    pub fn withdraw(env: Env, to: Address, amount: i128) {
        let held: i128 = env
            .storage()
            .instance()
            .get(&PoolKey::Holdings)
            .unwrap_or(0);
        if amount > held {
            panic!("mock_pool: withdraw exceeds holdings");
        }
        let token: Address = env.storage().instance().get(&PoolKey::Token).unwrap();
        token::Client::new(&env, &token).transfer(
            &env.current_contract_address(),
            &to,
            &amount,
        );
        env.storage()
            .instance()
            .set(&PoolKey::Holdings, &(held - amount));
    }

    /// Read the pool's booked holdings (test/debug helper).
    pub fn holdings(env: Env) -> i128 {
        env.storage()
            .instance()
            .get(&PoolKey::Holdings)
            .unwrap_or(0)
    }
}
