#![no_std]
//! SoroSense vault — non-custodial Soroban custody + guard layer.
//!
//! Implements the callable surface in `packages/vault-client/src/interface.ts`:
//! per-currency deposit/withdraw with share accounting, one-time on-chain consent,
//! keeper/approved allocation into Blend pools, and protective guards (pause,
//! per-pool cap, keeper freeze). Smart logic (risk scoring, rebalance decisions)
//! lives off-chain in the backend; this contract enforces that only consented,
//! guarded, correctly-authorized movements execute (KTD2).

mod allocate;
mod blend;
mod events;
mod guard;
mod nav;
mod shares;
mod storage;
mod types;

#[cfg(test)]
mod test;

use soroban_sdk::{
    contract, contractimpl, contractmeta, panic_with_error, token, Address, BytesN, Env,
};

use types::{Config, Currency, Error, ExitProposal, PoolStatus};

// Binary version metadata (bumped on each upgraded build).
// 1.3.0 — mark-to-market NAV: share_price now reflects pool interest (KTD-SC3/R6).
contractmeta!(key = "binver", val = "1.3.0");

#[contract]
pub struct Vault;

#[contractimpl]
impl Vault {
    /// Atomic deploy-time setup (runs once, inside the deploy transaction — no
    /// separate init call, so it cannot be front-run). Sets admin (config
    /// authority), keeper (Sentinel/agent role), and config (per-pool cap, min
    /// first deposit, virtual-offset constant).
    pub fn __constructor(env: Env, admin: Address, keeper: Address, config: Config) {
        storage::set_admin(&env, &admin);
        storage::set_keeper(&env, &keeper);
        storage::set_config(&env, &config);
        storage::extend_instance(&env);
    }

    // ── Depositor-signed writes ───────────────────────────────────────────

    /// Record the one-time safety-mandate consent (KTD3). Idempotent; no tier arg.
    /// Emits `ConsentSet` only on the absent→set transition — the mandate is a real
    /// user action (signed + paid), so it becomes a "Yours" activity row; a re-call
    /// is a genuine no-op and emits nothing so the feed can't double.
    pub fn set_policy_consent(env: Env, depositor: Address) {
        depositor.require_auth();
        if !storage::has_consent(&env, &depositor) {
            storage::set_consent(&env, &depositor);
            events::ConsentSet { depositor }.publish(&env);
        }
        storage::extend_instance(&env);
    }

    /// Turn the depositor's auto-compound (reinvest-rewards) preference on or off.
    /// Idempotent. This is an *economic* preference, deliberately not part of the
    /// safety mandate: `set_policy_consent` stays whole and unrevocable, because a
    /// bucket is pooled and a revoked consent would leave the keeper unable to tell
    /// one depositor's shares from the rest (STE-38 opsi 2, KTD3 + KTD-SC2 intact).
    /// Turning it off stops reinvestment only — allocate, rebalance, and the
    /// freeze-exit path are untouched.
    ///
    /// The contract records the preference; it does not enforce it. There is no
    /// on-chain compound entrypoint to gate — yield re-supply is a pool-level
    /// `allocate`, and a pooled bucket cannot attribute it per depositor without
    /// per-depositor accounting the vault does not keep. The keeper reads this and
    /// skips compound for depositors who are off (STE-40), fail-closed.
    pub fn set_auto_compound(env: Env, depositor: Address, enabled: bool) {
        depositor.require_auth();
        storage::set_auto_compound(&env, &depositor, enabled);
        storage::extend_instance(&env);
        events::AutoCompoundSet { depositor, enabled }.publish(&env);
    }

    /// Deposit `amount` of the currency's stablecoin into that bucket. Requires
    /// prior consent (KTD-SC2), so every principal in a pooled bucket is consented.
    pub fn deposit(env: Env, depositor: Address, currency: Currency, amount: i128) {
        depositor.require_auth();
        guard::require_not_paused(&env);
        if !storage::has_consent(&env, &depositor) {
            panic_with_error!(&env, Error::NoConsent);
        }
        if amount <= 0 {
            panic_with_error!(&env, Error::NonPositiveAmount);
        }
        let config = storage::get_config(&env);
        let total_shares = storage::get_total_shares(&env, currency);
        if total_shares == 0 && amount < config.min_first_deposit {
            panic_with_error!(&env, Error::BelowMinFirstDeposit);
        }
        let token_addr = allocate::require_token(&env, currency);
        token::Client::new(&env, &token_addr).transfer(
            &depositor,
            &env.current_contract_address(),
            &amount,
        );
        let minted = shares::mint_shares(&env, currency, amount, config.virtual_offset);
        // At a price above the scale a dust deposit can round to zero shares; reject
        // it rather than take the tokens for nothing (KTD10). The min-first-deposit
        // guard covers the empty bucket; this covers every deposit after yield.
        if minted <= 0 {
            panic_with_error!(&env, Error::MintsNoShares);
        }
        let owned = storage::get_shares(&env, &depositor, currency);
        storage::set_shares(&env, &depositor, currency, owned + minted);
        storage::set_total_shares(&env, currency, total_shares + minted);
        storage::set_total_assets(
            &env,
            currency,
            storage::get_total_assets(&env, currency) + amount,
        );
        events::Deposit {
            depositor,
            currency,
            amount,
            shares: minted,
        }
        .publish(&env);
    }

    /// Burn `shares` from the depositor's bucket and return the stablecoin. Pays from
    /// the bucket's idle balance, pulling any shortfall back from its pools first
    /// (KTD5) — so a depositor can exit their mark-to-market value (principal +
    /// accrued interest) without an operator deallocating first. Reverts
    /// `InsufficientLiquidity` if the pools cannot together cover the payout.
    pub fn withdraw(env: Env, depositor: Address, currency: Currency, shares: i128) {
        depositor.require_auth();
        guard::require_not_paused(&env);
        if shares <= 0 {
            panic_with_error!(&env, Error::NonPositiveAmount);
        }
        let owned = storage::get_shares(&env, &depositor, currency);
        if shares > owned {
            panic_with_error!(&env, Error::InsufficientShares);
        }
        let config = storage::get_config(&env);
        let assets = shares::redeem_assets(&env, currency, shares, config.virtual_offset);
        storage::set_shares(&env, &depositor, currency, owned - shares);
        storage::set_total_shares(
            &env,
            currency,
            storage::get_total_shares(&env, currency) - shares,
        );
        // Make the payout liquid: pull the shortfall from the bucket's pools into idle
        // (moves value between NAV terms without changing NAV), then debit idle.
        let idle = storage::get_total_assets(&env, currency);
        if idle < assets {
            allocate::pull_from_pools(&env, currency, assets - idle);
        }
        storage::set_total_assets(
            &env,
            currency,
            storage::get_total_assets(&env, currency) - assets,
        );
        let token_addr = allocate::require_token(&env, currency);
        token::Client::new(&env, &token_addr).transfer(
            &env.current_contract_address(),
            &depositor,
            &assets,
        );
        events::Withdraw {
            depositor,
            currency,
            amount: assets,
            shares,
        }
        .publish(&env);
    }

    /// Approve a keeper-proposed safe exit after a freeze, moving the bucket's
    /// funds to the safe pool. Bound to a stakeholder: the caller must hold shares
    /// in the exiting bucket (KTD-SC5).
    pub fn approve_exit(env: Env, depositor: Address, exit_id: u64) {
        depositor.require_auth();
        let (currency, proposal) = match allocate::find_exit(&env, exit_id) {
            Some(x) => x,
            None => panic_with_error!(&env, Error::NoPendingExit),
        };
        guard::require_not_paused(&env);
        if storage::get_shares(&env, &depositor, currency) <= 0 {
            panic_with_error!(&env, Error::NotAStakeholder);
        }
        allocate::execute_exit(&env, currency, &proposal);
        storage::clear_pending_exit(&env, currency);
        events::ExitApproved {
            currency,
            id: exit_id,
        }
        .publish(&env);
    }

    // ── Keeper / agent writes (run under consent; no depositor signature) ──

    /// Supply pooled bucket funds into a pool. Keeper-only, consent-gated (bucket
    /// has consented deposits); the allowlist / frozen / cap guards are enforced by
    /// `supply_to_pool` so every inbound path shares one definition.
    pub fn allocate(env: Env, pool: Address, currency: Currency, amount: i128) {
        guard::require_keeper(&env);
        guard::require_not_paused(&env);
        if amount <= 0 {
            panic_with_error!(&env, Error::NonPositiveAmount);
        }
        // Consent invariant: a bucket only holds consented deposits, so an empty
        // bucket has nothing consented to allocate (KTD-SC2, defense in depth).
        if storage::get_total_shares(&env, currency) == 0 {
            panic_with_error!(&env, Error::EmptyBucket);
        }
        allocate::supply_to_pool(&env, &pool, currency, amount);
        events::Allocated {
            currency,
            pool,
            amount,
        }
        .publish(&env);
    }

    /// Withdraw pooled funds from a pool back to the vault. Keeper-only.
    pub fn deallocate(env: Env, pool: Address, currency: Currency, amount: i128) {
        guard::require_keeper(&env);
        if amount <= 0 {
            panic_with_error!(&env, Error::NonPositiveAmount);
        }
        if amount > storage::get_pool_holdings(&env, currency, &pool) {
            panic_with_error!(&env, Error::InsufficientHoldings);
        }
        allocate::withdraw_from_pool(&env, &pool, currency, amount);
        events::Deallocated {
            currency,
            pool,
            amount,
        }
        .publish(&env);
    }

    /// Protective freeze — blocks flows into `pool` without moving funds. Keeper-only.
    pub fn freeze(env: Env, pool: Address) {
        guard::require_keeper(&env);
        storage::set_frozen(&env, &pool, true);
        events::Frozen { pool }.publish(&env);
    }

    /// Lift a freeze once a pool is healthy again. Keeper-only.
    pub fn unfreeze(env: Env, pool: Address) {
        guard::require_keeper(&env);
        storage::set_frozen(&env, &pool, false);
        events::Unfrozen { pool }.publish(&env);
    }

    /// Record a keeper-proposed safe exit for a frozen bucket; a depositor approves
    /// it later via `approve_exit`. Keeper-only.
    pub fn propose_exit(env: Env, currency: Currency, from_pool: Address, to_pool: Address) {
        guard::require_keeper(&env);
        let id = storage::next_exit_id(&env);
        let proposal = ExitProposal {
            id,
            currency,
            from_pool,
            to_pool,
        };
        storage::set_pending_exit(&env, currency, &proposal);
        events::ExitProposed { currency, id }.publish(&env);
    }

    /// Emergency global pause of state-changing entrypoints. Admin-only.
    pub fn pause(env: Env) {
        Self::require_admin(&env);
        storage::set_paused(&env, true);
    }

    /// Lift the global pause. Admin-only.
    pub fn unpause(env: Env) {
        Self::require_admin(&env);
        storage::set_paused(&env, false);
    }

    /// Replace the contract's WASM with a new build (admin-governed upgrade).
    /// Storage is preserved — only code changes — so bug fixes and the deferred
    /// features (real-Blend ABI, mark-to-market NAV) can ship without migrating
    /// funds. Admin-only; a compromised admin could swap logic, so production
    /// should move this behind a timelock/multisig (deferred, see plan).
    pub fn upgrade(env: Env, new_wasm_hash: BytesN<32>) {
        Self::require_admin(&env);
        env.deployer().update_current_contract_wasm(new_wasm_hash);
    }

    /// Register the SEP-41 stablecoin SAC backing a currency bucket. Admin-only.
    pub fn set_token(env: Env, currency: Currency, token: Address) {
        Self::require_admin(&env);
        storage::set_token(&env, currency, &token);
    }

    /// Add or remove a pool from the on-chain allowlist — the Sentinel-vetted Safe
    /// set that every `allocate`/exit destination is checked against (KTD-SC1). This
    /// is the on-chain backstop: even a compromised keeper can only move funds into
    /// an admin-vetted pool. Admin-only.
    pub fn set_pool_allowed(env: Env, pool: Address, allowed: bool) {
        Self::require_admin(&env);
        storage::set_pool_allowed(&env, &pool, allowed);
    }

    /// Whether a pool is in the allowlist (read).
    pub fn pool_allowed(env: Env, pool: Address) -> bool {
        storage::is_pool_allowed(&env, &pool)
    }

    /// Record a currency bucket's advisory target pool — an off-chain hint the
    /// backend/demo reads (and the U21 risky-pool re-target seam). Where funds may
    /// actually go is enforced by the allowlist (`set_pool_allowed`), not here.
    /// Admin-only.
    pub fn set_configured_pool(env: Env, currency: Currency, pool: Address) {
        Self::require_admin(&env);
        storage::set_configured_pool(&env, currency, &pool);
    }

    // ── Reads (match interface.ts) ────────────────────────────────────────
    /// Shares the user holds in a currency bucket.
    pub fn balance_of(env: Env, user: Address, currency: Currency) -> i128 {
        storage::get_shares(&env, &user, currency)
    }

    /// NAV per share for a currency bucket, scaled by `SHARE_PRICE_SCALE` (R12). A
    /// bucket with no accrued yield prices at exactly the scale. The backend earnings
    /// surfaces read this to turn shares into an asset value, since `balance_of`
    /// reports shares alone.
    pub fn share_price(env: Env, currency: Currency) -> i128 {
        let config = storage::get_config(&env);
        shares::share_price(&env, currency, config.virtual_offset)
    }

    /// Current asset value of a user's bucket — what `withdraw` would return for the
    /// full share balance today. Derived straight from NAV rather than composed from
    /// `share_price`, so the caller never eats a second rounding truncation.
    pub fn value_of(env: Env, user: Address, currency: Currency) -> i128 {
        let config = storage::get_config(&env);
        let owned = storage::get_shares(&env, &user, currency);
        shares::redeem_assets(&env, currency, owned, config.virtual_offset)
    }

    /// Whether a pool is accepting flows or frozen by the keeper.
    pub fn pool_status(env: Env, pool: Address) -> PoolStatus {
        if storage::is_frozen(&env, &pool) {
            PoolStatus::Frozen
        } else {
            PoolStatus::Active
        }
    }

    /// Whether the depositor has recorded the one-time safety-mandate consent.
    pub fn has_consent(env: Env, depositor: Address) -> bool {
        storage::has_consent(&env, &depositor)
    }

    /// Whether the depositor wants rewards auto-compounded. Unset reads `true`.
    pub fn auto_compound_enabled(env: Env, depositor: Address) -> bool {
        storage::auto_compound_enabled(&env, &depositor)
    }

    /// The pool currently holding a currency bucket's funds, if allocated.
    pub fn active_pool(env: Env, currency: Currency) -> Option<Address> {
        storage::get_active_pool(&env, currency)
    }

    /// The configured/target pool for a bucket (the demo re-target seam).
    pub fn configured_pool(env: Env, currency: Currency) -> Option<Address> {
        storage::get_configured_pool(&env, currency)
    }

    /// A pending safe-exit proposal for a currency bucket, if any.
    pub fn pending_exit(env: Env, currency: Currency) -> Option<ExitProposal> {
        storage::get_pending_exit(&env, currency)
    }
}

// Internal helpers (not contract entrypoints).
impl Vault {
    /// Gate a call on the configured admin's authorization.
    fn require_admin(env: &Env) {
        storage::get_admin(env).require_auth();
        storage::extend_instance(env);
    }
}
