//! Storage keys and typed, TTL-bumping accessors (KTD-SC6).
//!
//! One module owns every key so no entrypoint re-derives a key or forgets a TTL
//! bump. Instance storage: admin/keeper/config/pause/exit-counter. Persistent
//! storage: per-`(depositor,currency)` shares, per-currency totals/active pool,
//! per-pool holdings, per-depositor consent + auto-compound preference, per-pool
//! frozen flag, per-currency pending exit, per-currency token + configured pool.
//! Reads default sensibly.

use soroban_sdk::{contracttype, Address, Env, Vec};

use crate::types::{Config, Currency, ExitProposal};

/// Upper bound on how many distinct pools a currency bucket may hold at once. NAV
/// iterates this list on every price read, so it must stay bounded (Scout
/// `dos-unbounded-operation`); a 12th pool for one bucket is a misconfiguration.
pub const MAX_POOLS_PER_CURRENCY: u32 = 12;

#[contracttype]
pub enum DataKey {
    // ── instance ──
    Admin,
    Keeper,
    Config,
    Paused,
    ExitCounter,
    // ── persistent ──
    Token(Currency),
    ConfiguredPool(Currency),
    AllowedPool(Address),
    Shares(Address, Currency),
    TotalShares(Currency),
    TotalAssets(Currency),
    ActivePool(Currency),
    /// The set of pools whose `balance(vault)` counts toward a bucket's NAV. Written
    /// only by `supply_to_pool` (so an un-vetted pool can never enter NAV) and pruned
    /// only when a pool's `balance(vault)` hits 0 (interest outlives principal).
    PoolList(Currency),
    PoolHoldings(Currency, Address),
    Consent(Address),
    AutoCompound(Address),
    Frozen(Address),
    PendingExit(Currency),
}

// TTL windows (in ledgers). ~5s/ledger on Stellar → ~30 days persistent.
const DAY_LEDGERS: u32 = 17_280;
const PERSIST_BUMP: u32 = 30 * DAY_LEDGERS;
const PERSIST_THRESHOLD: u32 = 20 * DAY_LEDGERS;
const INSTANCE_BUMP: u32 = 30 * DAY_LEDGERS;
const INSTANCE_THRESHOLD: u32 = 20 * DAY_LEDGERS;

pub fn extend_instance(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_THRESHOLD, INSTANCE_BUMP);
}

fn get_persist<T: soroban_sdk::TryFromVal<Env, soroban_sdk::Val>>(
    env: &Env,
    key: &DataKey,
) -> Option<T> {
    let s = env.storage().persistent();
    if s.has(key) {
        s.extend_ttl(key, PERSIST_THRESHOLD, PERSIST_BUMP);
    }
    s.get(key)
}

fn set_persist<T: soroban_sdk::IntoVal<Env, soroban_sdk::Val>>(
    env: &Env,
    key: &DataKey,
    val: &T,
) {
    let s = env.storage().persistent();
    s.set(key, val);
    s.extend_ttl(key, PERSIST_THRESHOLD, PERSIST_BUMP);
}

// ── instance: admin / keeper / config / pause / counter ──

pub fn set_admin(env: &Env, admin: &Address) {
    env.storage().instance().set(&DataKey::Admin, admin);
}
pub fn get_admin(env: &Env) -> Address {
    env.storage().instance().get(&DataKey::Admin).unwrap()
}

pub fn set_keeper(env: &Env, keeper: &Address) {
    env.storage().instance().set(&DataKey::Keeper, keeper);
}
pub fn get_keeper(env: &Env) -> Address {
    env.storage().instance().get(&DataKey::Keeper).unwrap()
}

pub fn set_config(env: &Env, config: &Config) {
    env.storage().instance().set(&DataKey::Config, config);
}
pub fn get_config(env: &Env) -> Config {
    env.storage().instance().get(&DataKey::Config).unwrap()
}

pub fn set_paused(env: &Env, paused: bool) {
    env.storage().instance().set(&DataKey::Paused, &paused);
}
pub fn is_paused(env: &Env) -> bool {
    env.storage()
        .instance()
        .get(&DataKey::Paused)
        .unwrap_or(false)
}

/// Monotonic exit-proposal id source (never host randomness).
pub fn next_exit_id(env: &Env) -> u64 {
    let id: u64 = env
        .storage()
        .instance()
        .get(&DataKey::ExitCounter)
        .unwrap_or(0)
        + 1;
    env.storage().instance().set(&DataKey::ExitCounter, &id);
    id
}

// ── persistent: per-currency token + configured pool ──

pub fn set_token(env: &Env, currency: Currency, token: &Address) {
    set_persist(env, &DataKey::Token(currency), token);
}
pub fn get_token(env: &Env, currency: Currency) -> Option<Address> {
    get_persist(env, &DataKey::Token(currency))
}

pub fn set_configured_pool(env: &Env, currency: Currency, pool: &Address) {
    set_persist(env, &DataKey::ConfiguredPool(currency), pool);
}
pub fn get_configured_pool(env: &Env, currency: Currency) -> Option<Address> {
    get_persist(env, &DataKey::ConfiguredPool(currency))
}

// ── persistent: pool allowlist (the on-chain Sentinel-vetted Safe set) ──

pub fn set_pool_allowed(env: &Env, pool: &Address, allowed: bool) {
    set_persist(env, &DataKey::AllowedPool(pool.clone()), &allowed);
}
pub fn is_pool_allowed(env: &Env, pool: &Address) -> bool {
    get_persist::<bool>(env, &DataKey::AllowedPool(pool.clone())).unwrap_or(false)
}

// ── persistent: shares / totals ──

pub fn get_shares(env: &Env, user: &Address, currency: Currency) -> i128 {
    get_persist(env, &DataKey::Shares(user.clone(), currency)).unwrap_or(0)
}
pub fn set_shares(env: &Env, user: &Address, currency: Currency, shares: i128) {
    set_persist(env, &DataKey::Shares(user.clone(), currency), &shares);
}

pub fn get_total_shares(env: &Env, currency: Currency) -> i128 {
    get_persist(env, &DataKey::TotalShares(currency)).unwrap_or(0)
}
pub fn set_total_shares(env: &Env, currency: Currency, shares: i128) {
    set_persist(env, &DataKey::TotalShares(currency), &shares);
}

pub fn get_total_assets(env: &Env, currency: Currency) -> i128 {
    get_persist(env, &DataKey::TotalAssets(currency)).unwrap_or(0)
}
pub fn set_total_assets(env: &Env, currency: Currency, assets: i128) {
    set_persist(env, &DataKey::TotalAssets(currency), &assets);
}

// ── persistent: active pool / holdings ──

pub fn get_active_pool(env: &Env, currency: Currency) -> Option<Address> {
    get_persist(env, &DataKey::ActivePool(currency))
}
pub fn set_active_pool(env: &Env, currency: Currency, pool: &Address) {
    set_persist(env, &DataKey::ActivePool(currency), pool);
}
pub fn clear_active_pool(env: &Env, currency: Currency) {
    env.storage()
        .persistent()
        .remove(&DataKey::ActivePool(currency));
}

/// The bucket's NAV pool list (empty when never allocated).
pub fn get_pool_list(env: &Env, currency: Currency) -> Vec<Address> {
    get_persist(env, &DataKey::PoolList(currency)).unwrap_or(Vec::new(env))
}

/// Add `pool` to the bucket's NAV list if absent. Returns `false` when the list is
/// already at `MAX_POOLS_PER_CURRENCY` (caller panics `TooManyPools`); adding a pool
/// already present is a no-op that returns `true`.
pub fn add_to_pool_list(env: &Env, currency: Currency, pool: &Address) -> bool {
    let mut list = get_pool_list(env, currency);
    if list.contains(pool) {
        return true;
    }
    if list.len() >= MAX_POOLS_PER_CURRENCY {
        return false;
    }
    list.push_back(pool.clone());
    set_persist(env, &DataKey::PoolList(currency), &list);
    true
}

/// Drop `pool` from the bucket's NAV list (no-op if absent).
pub fn remove_from_pool_list(env: &Env, currency: Currency, pool: &Address) {
    let list = get_pool_list(env, currency);
    if let Some(i) = list.first_index_of(pool) {
        let mut next = list.clone();
        next.remove(i);
        set_persist(env, &DataKey::PoolList(currency), &next);
    }
}

pub fn get_pool_holdings(env: &Env, currency: Currency, pool: &Address) -> i128 {
    get_persist(env, &DataKey::PoolHoldings(currency, pool.clone())).unwrap_or(0)
}
pub fn set_pool_holdings(env: &Env, currency: Currency, pool: &Address, amount: i128) {
    set_persist(env, &DataKey::PoolHoldings(currency, pool.clone()), &amount);
}

// ── persistent: consent / frozen / pending exit ──

pub fn has_consent(env: &Env, depositor: &Address) -> bool {
    get_persist::<bool>(env, &DataKey::Consent(depositor.clone())).unwrap_or(false)
}
pub fn set_consent(env: &Env, depositor: &Address) {
    set_persist(env, &DataKey::Consent(depositor.clone()), &true);
}

/// Absent means enabled — a depositor who never touched the preference (and every
/// depositor from before it existed) auto-compounds, so the key's absence is the
/// on-by-default answer rather than a missing read.
pub fn auto_compound_enabled(env: &Env, depositor: &Address) -> bool {
    get_persist::<bool>(env, &DataKey::AutoCompound(depositor.clone())).unwrap_or(true)
}
pub fn set_auto_compound(env: &Env, depositor: &Address, enabled: bool) {
    set_persist(env, &DataKey::AutoCompound(depositor.clone()), &enabled);
}

pub fn is_frozen(env: &Env, pool: &Address) -> bool {
    get_persist::<bool>(env, &DataKey::Frozen(pool.clone())).unwrap_or(false)
}
pub fn set_frozen(env: &Env, pool: &Address, frozen: bool) {
    set_persist(env, &DataKey::Frozen(pool.clone()), &frozen);
}

pub fn get_pending_exit(env: &Env, currency: Currency) -> Option<ExitProposal> {
    get_persist(env, &DataKey::PendingExit(currency))
}
pub fn set_pending_exit(env: &Env, currency: Currency, proposal: &ExitProposal) {
    set_persist(env, &DataKey::PendingExit(currency), proposal);
}
pub fn clear_pending_exit(env: &Env, currency: Currency) {
    env.storage()
        .persistent()
        .remove(&DataKey::PendingExit(currency));
}
