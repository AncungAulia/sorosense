#![cfg(test)]

use soroban_sdk::{
    testutils::{Address as _, Ledger as _},
    token, Address, Env,
};

use crate::{types::Error, YieldPool, YieldPoolClient};

const YEAR: u64 = 31_536_000;
const HALF_YEAR: u64 = YEAR / 2;

/// A funded pool at `rate_bps`, holding `surplus` extra stablecoin so it can pay
/// interest on withdrawal. Returns (env, client, token client, admin, token addr).
fn setup(rate_bps: u32, surplus: i128) -> (Env, YieldPoolClient<'static>, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(1_000_000);

    let admin = Address::generate(&env);
    let sac = env.register_stellar_asset_contract_v2(admin.clone());
    let token_addr = sac.address();

    let pool_id = env.register(YieldPool, (admin.clone(), token_addr.clone(), rate_bps));
    let client = YieldPoolClient::new(&env, &pool_id);

    // The pool must hold the tokens it books (the vault "pushes" them on allocate).
    // Give it `surplus` extra so it can also pay interest.
    token::StellarAssetClient::new(&env, &token_addr).mint(&pool_id, &surplus);

    (env, client, admin, token_addr)
}

fn advance(env: &Env, secs: u64) {
    env.ledger().set_timestamp(env.ledger().timestamp() + secs);
}

#[test]
fn accrues_ten_percent_over_a_year() {
    let (env, pool, _admin, token) = setup(1000, 1_000_000);
    let vault = Address::generate(&env);
    // Vault pushes 100_000, then books it.
    token::StellarAssetClient::new(&env, &token).mint(&vault, &100_000);
    token::Client::new(&env, &token).transfer(&vault, &pool.address, &100_000);
    pool.supply(&vault, &100_000);

    assert_eq!(pool.balance(&vault), 100_000); // no phantom interest at t=0
    advance(&env, YEAR);
    assert_eq!(pool.balance(&vault), 110_000); // exactly +10%
}

#[test]
fn zero_elapsed_is_exactly_principal() {
    let (env, pool, _admin, _token) = setup(1000, 1_000_000);
    let a = Address::generate(&env);
    pool.supply(&a, &50_000);
    assert_eq!(pool.balance(&a), 50_000);
}

#[test]
fn two_suppliers_accrue_from_their_own_entry() {
    let (env, pool, _admin, _token) = setup(1000, 1_000_000);
    let a = Address::generate(&env);
    let b = Address::generate(&env);

    pool.supply(&a, &100_000);
    advance(&env, HALF_YEAR); // a has earned 5%
    pool.supply(&b, &100_000); // b enters now

    advance(&env, HALF_YEAR);
    // a: 5% (first half) + 5% (second half) = 10%
    assert_eq!(pool.balance(&a), 110_000);
    // b: only the second half = 5%
    assert_eq!(pool.balance(&b), 105_000);
}

#[test]
fn a_rate_change_is_not_retroactive() {
    let (env, pool, admin, _token) = setup(1000, 1_000_000);
    let a = Address::generate(&env);
    pool.supply(&a, &100_000);

    advance(&env, HALF_YEAR); // 5% at 10%
    pool.set_rate(&2000); // now 20%, but only forward
    advance(&env, HALF_YEAR); // 10% at 20%

    // 5% + 10% = 15% of principal — NOT 20% (which a multiplicative index would give).
    assert_eq!(pool.balance(&a), 115_000);
    let _ = admin;
}

#[test]
fn withdraw_pays_principal_plus_interest_and_empties() {
    let (env, pool, _admin, token) = setup(1000, 1_000_000);
    let a = Address::generate(&env);
    token::StellarAssetClient::new(&env, &token).mint(&a, &100_000);
    token::Client::new(&env, &token).transfer(&a, &pool.address, &100_000);
    pool.supply(&a, &100_000);

    advance(&env, YEAR);
    let owed = pool.balance(&a); // 110_000
    assert_eq!(owed, 110_000);

    let before = token::Client::new(&env, &token).balance(&a);
    pool.withdraw(&a, &owed);
    assert_eq!(pool.balance(&a), 0);
    assert_eq!(token::Client::new(&env, &token).balance(&a), before + owed);
}

#[test]
fn withdraw_above_balance_is_a_typed_error() {
    let (env, pool, _admin, _token) = setup(1000, 1_000_000);
    let a = Address::generate(&env);
    pool.supply(&a, &1_000);
    assert_eq!(pool.try_withdraw(&a, &2_000).err().unwrap().unwrap(), Error::InsufficientBalance.into());
}

#[test]
fn withdraw_without_liquidity_is_a_typed_error() {
    // No surplus: the pool holds exactly principal, cannot pay accrued interest.
    let (env, pool, _admin, token) = setup(1000, 0);
    let a = Address::generate(&env);
    token::StellarAssetClient::new(&env, &token).mint(&a, &100_000);
    token::Client::new(&env, &token).transfer(&a, &pool.address, &100_000);
    pool.supply(&a, &100_000);

    advance(&env, YEAR);
    // Owed 110_000 but the pool holds only 100_000 → legible InsufficientLiquidity,
    // not an opaque SAC transfer panic.
    assert_eq!(
        pool.try_withdraw(&a, &110_000).err().unwrap().unwrap(),
        Error::InsufficientLiquidity.into()
    );
}

#[test]
fn supply_requires_the_suppliers_authorization() {
    // KTD4: a fresh env with NO mocked auths — the donation-through-the-pool
    // back door must be shut: crediting a position needs that address's auth.
    let env = Env::default();
    env.ledger().set_timestamp(1_000_000);
    let admin = Address::generate(&env);
    let sac = env.register_stellar_asset_contract_v2(admin.clone());
    let pool_id = env.register(YieldPool, (admin.clone(), sac.address(), 1000u32));
    let pool = YieldPoolClient::new(&env, &pool_id);

    let victim = Address::generate(&env);
    assert!(pool.try_supply(&victim, &1_000_000).is_err()); // no auth → cannot credit
}

#[test]
fn non_positive_amounts_are_rejected() {
    let (env, pool, _admin, _token) = setup(1000, 1_000_000);
    let a = Address::generate(&env);
    assert_eq!(pool.try_supply(&a, &0).err().unwrap().unwrap(), Error::NonPositiveAmount.into());
    assert_eq!(pool.try_supply(&a, &-5).err().unwrap().unwrap(), Error::NonPositiveAmount.into());
    assert_eq!(pool.try_withdraw(&a, &0).err().unwrap().unwrap(), Error::NonPositiveAmount.into());
}

#[test]
fn set_rate_rejects_above_the_cap() {
    let (_env, pool, _admin, _token) = setup(1000, 1_000_000);
    assert_eq!(pool.try_set_rate(&100_001).err().unwrap().unwrap(), Error::RateTooHigh.into());
}

#[test]
#[should_panic]
fn constructor_rejects_a_rate_above_the_cap() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let sac = env.register_stellar_asset_contract_v2(admin.clone());
    // A too-high rate at deploy must fail atomically — the constructor panics, so
    // `register` (which runs it) panics too. `#[should_panic]` pins that failure.
    env.register(YieldPool, (admin.clone(), sac.address(), 100_001u32));
}

#[test]
fn default_rate_reads_ten_percent() {
    // Pins DEFAULT_YIELD_RATE_BPS (KTD8): the demo's 10% has one on-chain home.
    let (_env, pool, _admin, _token) = setup(1000, 0);
    assert_eq!(pool.rate_bps(), 1000);
}
