//! Guard helpers: role gates and the pause check (U5, KTD-SC4).
//!
//! The freeze/unfreeze/pause/propose_exit *entrypoints* live in `lib.rs`; this
//! module holds the shared checks they and the allocate path reuse, so a single
//! definition governs "keeper only" and "not paused".

use soroban_sdk::{panic_with_error, Env};

use crate::storage;
use crate::types::Error;

/// Require the configured keeper's authorization (Sentinel/agent role).
pub fn require_keeper(env: &Env) {
    storage::get_keeper(env).require_auth();
    storage::extend_instance(env);
}

/// Reject state-changing flows while the global pause is on.
pub fn require_not_paused(env: &Env) {
    if storage::is_paused(env) {
        panic_with_error!(env, Error::Paused);
    }
}
