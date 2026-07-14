//! Yield-pool types: a supplier's position and the typed errors.

use soroban_sdk::{contracterror, contracttype};

/// A single supplier's stake in the pool. `principal` is the value **realized**
/// into this position at the moment `entry_index` was captured; interest earned
/// since then is `principal × (current_index − entry_index) / (BPS·YEAR)`
/// (see `accrual.rs`). On any touch the accrued interest is rolled back into
/// `principal` and `entry_index` is reset to the current index, so a position is
/// always valued from a single reference point — a rate change never re-prices
/// interest already earned.
#[contracttype]
#[derive(Clone)]
pub struct Position {
    pub principal: i128,
    pub entry_index: i128,
}

/// Typed panics. `#[contracterror]` lets tests assert the exact failure via the
/// generated `try_*` client entrypoints rather than matching panic strings.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    /// `supply`/`withdraw` given a zero or negative amount.
    NonPositiveAmount = 1,
    /// `withdraw` for more than the position is currently worth.
    InsufficientBalance = 2,
    /// The pool cannot cover the payout — it holds less stablecoin than it owes.
    /// A legible failure instead of an opaque SAC transfer panic (R11).
    InsufficientLiquidity = 3,
    /// `set_rate` above the sanity cap.
    RateTooHigh = 4,
}
