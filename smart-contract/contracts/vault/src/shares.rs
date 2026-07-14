//! Share accounting with a virtual-offset (KTD-SC3).
//!
//! NAV is `nav.rs`'s mark-to-market value — `idle + Σ pool.balance(vault)` — not a
//! raw token balance. That distinction is now **load-bearing in a new way**: NAV
//! moves with pool interest (so the share price rises as yield accrues) yet still
//! ignores unsolicited token transfers, because `idle` is an internal counter and
//! every pool term is a position only the vault can credit under its own auth
//! (`yield_pool`'s `from.require_auth`, KTD4). A direct donation to the vault or to
//! a pool therefore moves neither term — the classic donation-inflation attack
//! still yields nothing. Equal virtual shares/assets (`virtual_offset`) keep the
//! first deposit at ~1:1 and absorb rounding.
//!
//! - mint:   shares = amount * (total_shares + V) / (nav + V)
//! - redeem: assets = shares * (nav + V) / (total_shares + V)
//! - price:  ray    = (nav + V) * SCALE / (total_shares + V)

use soroban_sdk::Env;

use crate::nav;
use crate::storage;
use crate::types::Currency;

/// Fixed-point scale for the NAV-per-share ray returned by [`share_price`]. A bucket
/// carrying no accrued yield prices at exactly this value (1 asset per share). Mirrors
/// `SHARE_PRICE_SCALE` in `packages/vault-client/src/interface.ts` — the two must agree.
pub const SHARE_PRICE_SCALE: i128 = 1_000_000_000;

/// Shares minted for depositing `amount` into `currency`'s bucket. NAV is read
/// **before** the deposit's assets are credited (as the caller does), so the price
/// the depositor pays reflects the bucket as it stood.
pub fn mint_shares(env: &Env, currency: Currency, amount: i128, virtual_offset: i128) -> i128 {
    let total_shares = storage::get_total_shares(env, currency);
    let nav = nav::nav(env, currency);
    amount * (total_shares + virtual_offset) / (nav + virtual_offset)
}

/// Assets returned for redeeming `shares` from `currency`'s bucket.
pub fn redeem_assets(env: &Env, currency: Currency, shares: i128, virtual_offset: i128) -> i128 {
    let total_shares = storage::get_total_shares(env, currency);
    let nav = nav::nav(env, currency);
    shares * (nav + virtual_offset) / (total_shares + virtual_offset)
}

/// NAV per share for `currency`'s bucket, scaled by [`SHARE_PRICE_SCALE`]. The virtual
/// offset makes an empty bucket price at the base scale rather than dividing by zero.
pub fn share_price(env: &Env, currency: Currency, virtual_offset: i128) -> i128 {
    let total_shares = storage::get_total_shares(env, currency);
    let nav = nav::nav(env, currency);
    (nav + virtual_offset) * SHARE_PRICE_SCALE / (total_shares + virtual_offset)
}
