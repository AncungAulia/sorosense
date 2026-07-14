//! The interest index — pure `i128` math, the one thing in this contract that
//! must not be subtly wrong (a rounding error here is a silent, permanent
//! mispricing of everyone's money — KTD2, so it is tested first).
//!
//! **The index is additive, not multiplicative.** On each roll it advances by
//! `rate_bps × elapsed_seconds` — a running sum with units of *bps·seconds* and
//! **no division**, so no per-roll flooring ever loses a sub-year accrual. A
//! position captures the index at entry; its value is
//!
//! ```text
//! value = principal + principal × (index − entry_index) / (BPS · YEAR)
//! ```
//!
//! The interest numerator (`principal × Δindex`) is formed **before** the single
//! floor division (multiply-before-divide — the exact bug CoinFabrik Scout's
//! `divide-before-multiply` detector flags). Because the index only sums
//! `rate × elapsed`, a rate change applies purely forward: interest already
//! folded into `index` is never re-priced (R14). Additivity (not compounding the
//! index) is what makes "10% for six months then 20% for six months" equal
//! 15% of principal, not 15.5%.

/// Basis-points denominator: `100% = 10_000 bps`.
pub const BPS: i128 = 10_000;
/// Seconds in a (365-day) year — the accrual clock's denominator.
pub const SECONDS_PER_YEAR: i128 = 31_536_000;
/// `BPS × SECONDS_PER_YEAR` — the divisor turning `principal × Δ(bps·seconds)`
/// into base-unit interest.
pub const BPS_YEAR: i128 = BPS * SECONDS_PER_YEAR; // 315_360_000_000

/// Advance the index by `rate_bps × elapsed_secs`. Checked, so a pathological
/// elapsed (a corrupt ledger clock) panics rather than wrapping into a negative
/// index that would then *shrink* everyone's balance.
pub fn advance_index(index: i128, rate_bps: u32, elapsed_secs: u64) -> i128 {
    let delta = (rate_bps as i128)
        .checked_mul(elapsed_secs as i128)
        .expect("yield_pool: index advance overflow");
    index
        .checked_add(delta)
        .expect("yield_pool: index overflow")
}

/// Value a position holding `principal` (captured at `entry_index`) at the
/// current `index`. Multiply before divide; the interest floors toward the pool,
/// never above the true value.
pub fn value_at(principal: i128, entry_index: i128, index: i128) -> i128 {
    if principal <= 0 {
        return 0;
    }
    // The index is monotonic non-decreasing, so `growth ≥ 0` for any position
    // whose `entry_index` was captured on the same monotonic clock.
    let growth = index
        .checked_sub(entry_index)
        .expect("yield_pool: index underflow");
    let interest = principal
        .checked_mul(growth)
        .expect("yield_pool: interest overflow")
        / BPS_YEAR;
    principal
        .checked_add(interest)
        .expect("yield_pool: value overflow")
}
