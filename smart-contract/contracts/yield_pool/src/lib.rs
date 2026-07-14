#![no_std]
//! `yield_pool` — a Soroban pool that actually pays (KTD1).
//!
//! A self-contained, deterministic stand-in for a real lending venue that accrues
//! a **real, on-chain, time-based** rate — so the vault that allocates into it can
//! mark its holdings to a value that grows with ledger time, and the app can quote
//! an APY read from the chain instead of a hardcoded catalog constant. We build
//! our own rather than integrate Blend because Blend's *testnet* supply APY is ~0%
//! (no borrow demand), its pools take Circle's USDC (not our self-issued faucet
//! asset), and its ABI is `submit(Request[])` + off-chain rate math — none of which
//! fit a demo. Real Blend stays a post-hackathon adapter behind the vault's seam.
//!
//! **Surface is a superset of what the vault's `blend.rs` client already calls**
//! (`supply`/`withdraw`), so the vault compiles against it unchanged. The extra
//! reads (`balance`, `rate_bps`) are what mark-to-market and the on-chain APY need.
//!
//! **Push token model** (same as `mock_pool`): the vault transfers the stablecoin
//! to this contract's address during `allocate`, then calls `supply` to book the
//! credit. `withdraw` returns tokens from the pool's own balance — which, after
//! accrual, must be larger than principal, so the pool needs a stablecoin surplus
//! to pay interest (a faucet top-up in the demo; a real venue mints its own yield).
//!
//! Accrual math lives in `accrual.rs` (pure, tested first). See KTD2/KTD4/KTD10.

use soroban_sdk::{contract, contractimpl, panic_with_error, token, Address, Env};

mod accrual;
mod storage;
mod types;

#[cfg(test)]
mod test;

use types::{Error, Position};

/// Sanity ceiling on the annual rate: 1000% (`100_000` bps). Guards against a
/// fat-fingered `set_rate` that would overflow the index or promise the absurd.
const MAX_RATE_BPS: u32 = 100_000;

#[contract]
pub struct YieldPool;

#[contractimpl]
impl YieldPool {
    /// Atomic setup at deploy (Protocol 22) — no `initialize` to front-run, no
    /// reinit path. `rate_bps` is the annual rate (`1000` = 10%).
    pub fn __constructor(env: Env, admin: Address, token: Address, rate_bps: u32) {
        if rate_bps > MAX_RATE_BPS {
            panic_with_error!(&env, Error::RateTooHigh);
        }
        storage::set_admin(&env, &admin);
        storage::set_token(&env, &token);
        storage::set_rate_bps(&env, rate_bps);
        storage::set_index(&env, 0);
        storage::set_last_ts(&env, env.ledger().timestamp());
        storage::set_total_principal(&env, 0);
        storage::extend_instance(&env);
    }

    /// Book supplied funds against `from`'s position. The vault has already
    /// transferred `amount` of the stablecoin here; this rolls `from`'s accrued
    /// interest into principal and credits `amount`.
    ///
    /// `from.require_auth()` is a **security requirement, not a nicety** (KTD4):
    /// without it, anyone could transfer tokens here and call `supply(vault, huge)`
    /// to inflate the vault's mark-to-market NAV — and with it, the share price. A
    /// contract authorizes the sub-invocations it makes itself, so only the vault
    /// can credit the vault's position.
    pub fn supply(env: Env, from: Address, amount: i128) {
        from.require_auth();
        if amount <= 0 {
            panic_with_error!(&env, Error::NonPositiveAmount);
        }
        let index = roll_index(&env);
        let realized = value_of(&env, &from, index);
        storage::set_position(
            &env,
            &from,
            &Position {
                principal: realized + amount,
                entry_index: index,
            },
        );
        storage::set_total_principal(&env, storage::get_total_principal(&env) + amount);
        storage::extend_instance(&env);
    }

    /// Pay `amount` of the stablecoin to `to` out of the pool's balance. After
    /// accrual `amount` may legitimately exceed everything ever supplied — that
    /// difference *is* the interest (KTD5, so the vault can pull a depositor's
    /// grown value home without an operator in the loop).
    pub fn withdraw(env: Env, to: Address, amount: i128) {
        to.require_auth();
        if amount <= 0 {
            panic_with_error!(&env, Error::NonPositiveAmount);
        }
        let index = roll_index(&env);
        let current = value_of(&env, &to, index);
        if amount > current {
            panic_with_error!(&env, Error::InsufficientBalance);
        }
        // A legible failure instead of an opaque SAC insufficient-balance panic:
        // the pool must actually hold what it owes (R11).
        let token = token::Client::new(&env, &storage::get_token(&env));
        if token.balance(&env.current_contract_address()) < amount {
            panic_with_error!(&env, Error::InsufficientLiquidity);
        }
        storage::set_position(
            &env,
            &to,
            &Position {
                principal: current - amount,
                entry_index: index,
            },
        );
        token.transfer(&env.current_contract_address(), &to, &amount);
        let booked = storage::get_total_principal(&env);
        storage::set_total_principal(&env, if amount > booked { 0 } else { booked - amount });
        storage::extend_instance(&env);
    }

    /// What `of`'s position is worth **at the current ledger timestamp** —
    /// principal plus interest accrued to now. A pure read: it advances the index
    /// in memory but never writes, so a `balance` call costs nothing to store and
    /// the value curves continuously with time (R3).
    pub fn balance(env: Env, of: Address) -> i128 {
        value_of(&env, &of, current_index(&env))
    }

    /// The annual rate in basis points (`1000` = 10%). The on-chain, non-hardcoded
    /// number the backend reads and presents as the display APY (R2).
    pub fn rate_bps(env: Env) -> u32 {
        storage::get_rate_bps(&env)
    }

    /// Net booked principal across suppliers (ops/telemetry — not used for pricing).
    pub fn total_supplied(env: Env) -> i128 {
        storage::get_total_principal(&env)
    }

    /// The pool's own stablecoin balance — *can it pay what it owes?* (R11). The
    /// gap between this and `balance(supplier)` is the interest liquidity the pool
    /// still needs topped up.
    pub fn liquidity(env: Env) -> i128 {
        token::Client::new(&env, &storage::get_token(&env)).balance(&env.current_contract_address())
    }

    /// Change the annual rate. Admin-only. Refreshes the index **first** so the old
    /// rate applies up to now and the new rate applies purely forward (R14) — a
    /// rate change is never retroactive.
    pub fn set_rate(env: Env, rate_bps: u32) {
        storage::get_admin(&env).require_auth();
        if rate_bps > MAX_RATE_BPS {
            panic_with_error!(&env, Error::RateTooHigh);
        }
        roll_index(&env);
        storage::set_rate_bps(&env, rate_bps);
        storage::extend_instance(&env);
    }
}

/// Advance and **persist** the index to the current ledger timestamp, returning
/// it. Called before any state change so positions are valued from a fresh index.
fn roll_index(env: &Env) -> i128 {
    let now = env.ledger().timestamp();
    let last = storage::get_last_ts(env);
    if now > last {
        let index = accrual::advance_index(storage::get_index(env), storage::get_rate_bps(env), now - last);
        storage::set_index(env, index);
        storage::set_last_ts(env, now);
        index
    } else {
        storage::get_index(env)
    }
}

/// The index advanced to now **without** persisting — for read paths (`balance`).
fn current_index(env: &Env) -> i128 {
    let now = env.ledger().timestamp();
    let last = storage::get_last_ts(env);
    accrual::advance_index(storage::get_index(env), storage::get_rate_bps(env), now.saturating_sub(last))
}

/// Value `who`'s stored position at `index` (0 if they have none).
fn value_of(env: &Env, who: &Address, index: i128) -> i128 {
    match storage::get_position(env, who) {
        Some(pos) => accrual::value_at(pos.principal, pos.entry_index, index),
        None => 0,
    }
}
