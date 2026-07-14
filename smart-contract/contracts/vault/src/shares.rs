//! Share accounting with a virtual-offset (KTD-SC3).
//!
//! NAV is derived from **internal** per-share counters (`total_shares`,
//! `total_assets`), never a live token balance query — so a direct token
//! donation to the vault does not move the share price and the classic
//! donation-inflation attack yields nothing. Equal virtual shares/assets
//! (`virtual_offset`) keep the first deposit at ~1:1 and absorb rounding.
//!
//! - mint:   shares = amount * (total_shares + V) / (total_assets + V)
//! - redeem: assets = shares * (total_assets + V) / (total_shares + V)
//! - price:  ray    = (total_assets + V) * SCALE / (total_shares + V)

use soroban_sdk::Env;

use crate::storage;
use crate::types::Currency;

/// Fixed-point scale for the NAV-per-share ray returned by [`share_price`]. A bucket
/// carrying no accrued yield prices at exactly this value (1 asset per share). Mirrors
/// `SHARE_PRICE_SCALE` in `packages/vault-client/src/interface.ts` — the two must agree.
pub const SHARE_PRICE_SCALE: i128 = 1_000_000_000;

/// Shares minted for depositing `amount` into `currency`'s bucket.
pub fn mint_shares(env: &Env, currency: Currency, amount: i128, virtual_offset: i128) -> i128 {
    let total_shares = storage::get_total_shares(env, currency);
    let total_assets = storage::get_total_assets(env, currency);
    amount * (total_shares + virtual_offset) / (total_assets + virtual_offset)
}

/// Assets returned for redeeming `shares` from `currency`'s bucket.
pub fn redeem_assets(env: &Env, currency: Currency, shares: i128, virtual_offset: i128) -> i128 {
    let total_shares = storage::get_total_shares(env, currency);
    let total_assets = storage::get_total_assets(env, currency);
    shares * (total_assets + virtual_offset) / (total_shares + virtual_offset)
}

/// NAV per share for `currency`'s bucket, scaled by [`SHARE_PRICE_SCALE`]. The virtual
/// offset makes an empty bucket price at the base scale rather than dividing by zero.
pub fn share_price(env: &Env, currency: Currency, virtual_offset: i128) -> i128 {
    let total_shares = storage::get_total_shares(env, currency);
    let total_assets = storage::get_total_assets(env, currency);
    (total_assets + virtual_offset) * SHARE_PRICE_SCALE / (total_shares + virtual_offset)
}
