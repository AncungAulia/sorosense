//! Contract events (SDK-26 `#[contractevent]` types).
//!
//! The frontend reads these for the "Agent activity" feed and the freeze banner
//! (origin U14/U15). Topics are indexed for filtering; the rest is event data.

use soroban_sdk::{contractevent, Address};

use crate::types::Currency;

#[contractevent]
pub struct Deposit {
    #[topic]
    pub depositor: Address,
    pub currency: Currency,
    pub amount: i128,
    pub shares: i128,
}

#[contractevent]
pub struct Withdraw {
    #[topic]
    pub depositor: Address,
    pub currency: Currency,
    pub amount: i128,
    pub shares: i128,
}

/// Emitted on every `set_auto_compound`, including a re-set to the same value —
/// the frontend derives the "Yours" activity row from this, so a silent no-op
/// would drop a user action the depositor actually signed and paid for.
#[contractevent]
pub struct AutoCompoundSet {
    #[topic]
    pub depositor: Address,
    pub enabled: bool,
}

/// Emitted the first time a depositor records the one-time safety mandate
/// (the absent→set transition). Same principle as `AutoCompoundSet`: the depositor
/// signs and pays for `set_policy_consent`, so the frontend derives a "Signed
/// auto-optimize mandate" activity row from this event. Consent is idempotent and
/// unrevocable, so we emit exactly once — a re-call is a genuine no-op and emits
/// nothing, keeping the live feed from doubling. Payload is just the depositor
/// (no tier, no flag — consent has no parameters and cannot be revoked).
#[contractevent]
pub struct ConsentSet {
    #[topic]
    pub depositor: Address,
}

#[contractevent]
pub struct Allocated {
    #[topic]
    pub currency: Currency,
    pub pool: Address,
    pub amount: i128,
}

#[contractevent]
pub struct Deallocated {
    #[topic]
    pub currency: Currency,
    pub pool: Address,
    pub amount: i128,
}

#[contractevent]
pub struct Frozen {
    #[topic]
    pub pool: Address,
}

#[contractevent]
pub struct Unfrozen {
    #[topic]
    pub pool: Address,
}

#[contractevent]
pub struct ExitProposed {
    #[topic]
    pub currency: Currency,
    pub id: u64,
}

#[contractevent]
pub struct ExitApproved {
    #[topic]
    pub currency: Currency,
    pub id: u64,
}
