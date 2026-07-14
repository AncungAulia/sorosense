//! Storage keys and typed, TTL-bumping accessors — one module owns every key so
//! no entrypoint re-derives a key or forgets a TTL bump (mirrors the vault's
//! `storage.rs`). Instance: admin/token/rate/index/last-roll + a booked-principal
//! ops counter. Persistent: one `Position` per supplier.

use soroban_sdk::{contracttype, Address, Env};

use crate::types::Position;

#[contracttype]
pub enum DataKey {
    // ── instance ──
    Admin,
    Token,
    RateBps,
    /// Accumulated `Σ rate_bps × elapsed` (bps·seconds) since deploy.
    Index,
    /// Ledger timestamp the index was last advanced to.
    LastIndexTs,
    /// Net booked principal across suppliers — an ops read, not used for pricing.
    TotalPrincipal,
    // ── persistent ──
    Position(Address),
}

// TTL windows (~5s/ledger → ~30 days persistent), matching the vault.
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

// ── instance accessors ──

pub fn get_admin(env: &Env) -> Address {
    env.storage().instance().get(&DataKey::Admin).unwrap()
}
pub fn set_admin(env: &Env, admin: &Address) {
    env.storage().instance().set(&DataKey::Admin, admin);
}
pub fn get_token(env: &Env) -> Address {
    env.storage().instance().get(&DataKey::Token).unwrap()
}
pub fn set_token(env: &Env, token: &Address) {
    env.storage().instance().set(&DataKey::Token, token);
}
pub fn get_rate_bps(env: &Env) -> u32 {
    env.storage().instance().get(&DataKey::RateBps).unwrap_or(0)
}
pub fn set_rate_bps(env: &Env, rate: u32) {
    env.storage().instance().set(&DataKey::RateBps, &rate);
}
pub fn get_index(env: &Env) -> i128 {
    env.storage().instance().get(&DataKey::Index).unwrap_or(0)
}
pub fn set_index(env: &Env, index: i128) {
    env.storage().instance().set(&DataKey::Index, &index);
}
pub fn get_last_ts(env: &Env) -> u64 {
    env.storage().instance().get(&DataKey::LastIndexTs).unwrap_or(0)
}
pub fn set_last_ts(env: &Env, ts: u64) {
    env.storage().instance().set(&DataKey::LastIndexTs, &ts);
}
pub fn get_total_principal(env: &Env) -> i128 {
    env.storage()
        .instance()
        .get(&DataKey::TotalPrincipal)
        .unwrap_or(0)
}
pub fn set_total_principal(env: &Env, v: i128) {
    env.storage().instance().set(&DataKey::TotalPrincipal, &v);
}

// ── persistent accessors ──

pub fn get_position(env: &Env, who: &Address) -> Option<Position> {
    env.storage().persistent().get(&DataKey::Position(who.clone()))
}
pub fn set_position(env: &Env, who: &Address, pos: &Position) {
    let key = DataKey::Position(who.clone());
    env.storage().persistent().set(&key, pos);
    env.storage()
        .persistent()
        .extend_ttl(&key, PERSIST_THRESHOLD, PERSIST_BUMP);
}
