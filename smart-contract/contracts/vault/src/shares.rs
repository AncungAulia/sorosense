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

use soroban_sdk::Env;

use crate::storage;
use crate::types::Currency;

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
