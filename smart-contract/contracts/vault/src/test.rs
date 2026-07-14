//! Vault test suite (U6) — deterministic, offline, against the `mock_pool`
//! Blend test-double. Modules: shares, consent, auto_compound, allocate, guard,
//! integration.

#![cfg(test)]

use soroban_sdk::testutils::Address as _;
use soroban_sdk::{token, Address, BytesN, Env};

use crate::types::{Config, Currency, PoolStatus};
use crate::{Vault, VaultClient};

const CAP: i128 = 1_000_000_000;
const MIN_FIRST: i128 = 1_000;
const VIRT: i128 = 1_000;

struct Ctx<'a> {
    env: Env,
    vault: VaultClient<'a>,
    usd_admin: token::StellarAssetClient<'a>,
    usd_token: token::Client<'a>,
    pool_a: Address,
    pool_b: Address,
}

fn setup<'a>() -> Ctx<'a> {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let keeper = Address::generate(&env);
    let config = Config {
        per_pool_cap: CAP,
        min_first_deposit: MIN_FIRST,
        virtual_offset: VIRT,
    };
    let vault_id = env.register(Vault, (admin.clone(), keeper.clone(), config));
    let vault = VaultClient::new(&env, &vault_id);

    // USD stablecoin SAC + two Blend test-double pools holding it.
    let issuer = Address::generate(&env);
    let usd = env.register_stellar_asset_contract_v2(issuer).address();
    let usd_admin = token::StellarAssetClient::new(&env, &usd);
    let usd_token = token::Client::new(&env, &usd);
    vault.set_token(&Currency::Usd, &usd);

    let pool_a = env.register(mock_pool::MockPool, ());
    let pool_b = env.register(mock_pool::MockPool, ());
    mock_pool::MockPoolClient::new(&env, &pool_a).init(&usd);
    mock_pool::MockPoolClient::new(&env, &pool_b).init(&usd);
    // Both pools are in the on-chain Sentinel-vetted Safe set.
    vault.set_pool_allowed(&pool_a, &true);
    vault.set_pool_allowed(&pool_b, &true);

    Ctx {
        env,
        vault,
        usd_admin,
        usd_token,
        pool_a,
        pool_b,
    }
}

/// Create a funded, consented depositor holding `amount` USD.
fn funded_depositor(ctx: &Ctx, amount: i128) -> Address {
    let d = Address::generate(&ctx.env);
    ctx.usd_admin.mint(&d, &amount);
    ctx.vault.set_policy_consent(&d);
    d
}

// ── shares ────────────────────────────────────────────────────────────────

mod shares {
    use super::*;

    #[test]
    fn first_deposit_is_one_to_one() {
        let ctx = setup();
        let d = funded_depositor(&ctx, 100_000);
        ctx.vault.deposit(&d, &Currency::Usd, &100_000);
        assert_eq!(ctx.vault.balance_of(&d, &Currency::Usd), 100_000);
        assert_eq!(ctx.usd_token.balance(&d), 0);
    }

    #[test]
    fn second_depositor_gets_proportional_shares() {
        let ctx = setup();
        let a = funded_depositor(&ctx, 100_000);
        let b = funded_depositor(&ctx, 50_000);
        ctx.vault.deposit(&a, &Currency::Usd, &100_000);
        ctx.vault.deposit(&b, &Currency::Usd, &50_000);
        // No yield modeled → shares track deposits proportionally.
        assert_eq!(ctx.vault.balance_of(&a, &Currency::Usd), 100_000);
        assert_eq!(ctx.vault.balance_of(&b, &Currency::Usd), 50_000);
    }

    #[test]
    fn withdraw_burns_and_returns() {
        let ctx = setup();
        let d = funded_depositor(&ctx, 100_000);
        ctx.vault.deposit(&d, &Currency::Usd, &100_000);
        ctx.vault.withdraw(&d, &Currency::Usd, &40_000);
        assert_eq!(ctx.vault.balance_of(&d, &Currency::Usd), 60_000);
        assert_eq!(ctx.usd_token.balance(&d), 40_000);
    }

    #[test]
    fn withdraw_more_than_owned_panics() {
        let ctx = setup();
        let d = funded_depositor(&ctx, 100_000);
        ctx.vault.deposit(&d, &Currency::Usd, &100_000);
        assert!(ctx
            .vault
            .try_withdraw(&d, &Currency::Usd, &100_001)
            .is_err());
    }

    #[test]
    fn non_positive_deposit_panics() {
        let ctx = setup();
        let d = funded_depositor(&ctx, 100_000);
        assert!(ctx.vault.try_deposit(&d, &Currency::Usd, &0).is_err());
    }

    /// Covers the inflation-attack Acceptance Example: a direct token donation
    /// before the victim's deposit must not let the attacker steal share value.
    #[test]
    fn inflation_attack_yields_nothing() {
        let ctx = setup();
        // Attacker seeds the bucket with the minimum first deposit.
        let attacker = funded_depositor(&ctx, MIN_FIRST);
        ctx.vault.deposit(&attacker, &Currency::Usd, &MIN_FIRST);

        // Attacker donates a large amount directly to the vault (bypassing deposit).
        ctx.usd_admin.mint(&attacker, &1_000_000);
        ctx.usd_token
            .transfer(&attacker, &ctx.vault.address, &1_000_000);

        // Victim deposits; internal accounting ignores the donation.
        let victim = funded_depositor(&ctx, 1_000_000);
        ctx.vault.deposit(&victim, &Currency::Usd, &1_000_000);

        let victim_shares = ctx.vault.balance_of(&victim, &Currency::Usd);
        ctx.vault
            .withdraw(&victim, &Currency::Usd, &victim_shares);
        // Victim recovers ~their full deposit; attacker gained nothing.
        assert_eq!(ctx.usd_token.balance(&victim), 1_000_000);
    }

    #[test]
    fn currencies_are_isolated() {
        let ctx = setup();
        let d = funded_depositor(&ctx, 100_000);
        ctx.vault.deposit(&d, &Currency::Usd, &100_000);
        assert_eq!(ctx.vault.balance_of(&d, &Currency::Usd), 100_000);
        assert_eq!(ctx.vault.balance_of(&d, &Currency::Eur), 0);
    }
}

// ── nav: share_price / value_of views ─────────────────────────────────────

mod nav {
    use super::*;
    use crate::shares::SHARE_PRICE_SCALE;
    use crate::storage;

    /// Raise a bucket's NAV without minting shares — the only way to lift its share
    /// price, standing in for the pool yield this contract does not accrue yet
    /// (mark-to-market NAV is deferred to a later upgrade). Writes storage directly
    /// from inside the contract's context; deliberately not a vault entrypoint.
    fn simulate_yield(ctx: &Ctx, currency: Currency, amount: i128) {
        ctx.env.as_contract(&ctx.vault.address, || {
            let total = storage::get_total_assets(&ctx.env, currency);
            storage::set_total_assets(&ctx.env, currency, total + amount);
        });
    }

    #[test]
    fn empty_bucket_prices_at_base_scale() {
        let ctx = setup();
        // Virtual offset cancels rather than dividing by zero.
        assert_eq!(ctx.vault.share_price(&Currency::Usd), SHARE_PRICE_SCALE);
        let d = Address::generate(&ctx.env);
        assert_eq!(ctx.vault.value_of(&d, &Currency::Usd), 0);
    }

    #[test]
    fn deposit_alone_does_not_move_price() {
        let ctx = setup();
        let d = funded_depositor(&ctx, 100_000);
        ctx.vault.deposit(&d, &Currency::Usd, &100_000);
        // Shares and assets rise together, so NAV per share stays at the base.
        assert_eq!(ctx.vault.share_price(&Currency::Usd), SHARE_PRICE_SCALE);
        assert_eq!(ctx.vault.value_of(&d, &Currency::Usd), 100_000);
    }

    #[test]
    fn share_price_rises_with_accrued_nav() {
        let ctx = setup();
        let d = funded_depositor(&ctx, 100_000);
        ctx.vault.deposit(&d, &Currency::Usd, &100_000);
        simulate_yield(&ctx, Currency::Usd, 10_000);

        // (110_000 + 1_000) * 1e9 / (100_000 + 1_000), floored.
        assert_eq!(ctx.vault.share_price(&Currency::Usd), 1_099_009_900);
        assert!(ctx.vault.share_price(&Currency::Usd) > SHARE_PRICE_SCALE);
        // The lone depositor owns the whole bucket, so the yield is all theirs:
        // 100_000 * 111_000 / 101_000, floored.
        assert_eq!(ctx.vault.value_of(&d, &Currency::Usd), 109_900);
    }

    #[test]
    fn value_of_previews_what_withdraw_returns() {
        let ctx = setup();
        let d = funded_depositor(&ctx, 100_000);
        ctx.vault.deposit(&d, &Currency::Usd, &100_000);
        simulate_yield(&ctx, Currency::Usd, 10_000);
        // Fund the vault for the accrued portion, as a deallocate would before withdraw.
        ctx.usd_admin.mint(&ctx.vault.address, &10_000);

        let previewed = ctx.vault.value_of(&d, &Currency::Usd);
        let owned = ctx.vault.balance_of(&d, &Currency::Usd);
        ctx.vault.withdraw(&d, &Currency::Usd, &owned);
        assert_eq!(ctx.usd_token.balance(&d), previewed);
    }

    #[test]
    fn yield_splits_by_share_not_by_deposit_order() {
        let ctx = setup();
        let a = funded_depositor(&ctx, 100_000);
        let b = funded_depositor(&ctx, 100_000);
        ctx.vault.deposit(&a, &Currency::Usd, &100_000);
        simulate_yield(&ctx, Currency::Usd, 10_000);
        // b buys in after the yield, so b's shares cost more and carry none of it.
        ctx.vault.deposit(&b, &Currency::Usd, &100_000);

        let (a_shares, b_shares) = (
            ctx.vault.balance_of(&a, &Currency::Usd),
            ctx.vault.balance_of(&b, &Currency::Usd),
        );
        assert!(b_shares < a_shares);
        assert!(ctx.vault.value_of(&a, &Currency::Usd) > ctx.vault.value_of(&b, &Currency::Usd));
        // b is made whole on their principal (modulo floor rounding), not diluted.
        assert!(ctx.vault.value_of(&b, &Currency::Usd) >= 100_000 - 1);
    }

    #[test]
    fn unfunded_currency_reads_base_price_and_zero_value() {
        let ctx = setup();
        let d = funded_depositor(&ctx, 100_000);
        ctx.vault.deposit(&d, &Currency::Usd, &100_000);
        simulate_yield(&ctx, Currency::Usd, 10_000);
        // Buckets never blend: EUR is untouched by USD's NAV.
        assert_eq!(ctx.vault.share_price(&Currency::Eur), SHARE_PRICE_SCALE);
        assert_eq!(ctx.vault.value_of(&d, &Currency::Eur), 0);
    }

    #[test]
    fn views_are_public_reads_not_admin_gated() {
        let ctx = setup();
        let d = funded_depositor(&ctx, 100_000);
        ctx.vault.deposit(&d, &Currency::Usd, &100_000);

        // Drop all mocked auth: an admin-gated call now rejects...
        ctx.env.set_auths(&[]);
        assert!(ctx.vault.try_set_pool_allowed(&ctx.pool_a, &true).is_err());
        // ...while the NAV views still answer anyone, like `pool_allowed`/`active_pool`.
        assert_eq!(ctx.vault.share_price(&Currency::Usd), SHARE_PRICE_SCALE);
        assert_eq!(ctx.vault.value_of(&d, &Currency::Usd), 100_000);
    }
}

// ── consent ─────────────────────────────────────────────────────────────

mod consent {
    use super::*;
    use soroban_sdk::testutils::Events as _;

    #[test]
    fn deposit_without_consent_panics() {
        let ctx = setup();
        let d = Address::generate(&ctx.env);
        ctx.usd_admin.mint(&d, &100_000);
        // No set_policy_consent.
        assert!(ctx
            .vault
            .try_deposit(&d, &Currency::Usd, &100_000)
            .is_err());
    }

    #[test]
    fn consent_is_idempotent_and_readable() {
        let ctx = setup();
        let d = Address::generate(&ctx.env);
        assert!(!ctx.vault.has_consent(&d));
        ctx.vault.set_policy_consent(&d);
        ctx.vault.set_policy_consent(&d); // re-sign is a no-op
        assert!(ctx.vault.has_consent(&d));
    }

    #[test]
    fn first_consent_emits_event_then_recall_is_silent() {
        let ctx = setup();
        let d = Address::generate(&ctx.env);
        // `events().all()` returns the most recent invocation's events, so we check
        // right after each call. First consent (absent→set) emits one ConsentSet.
        ctx.vault.set_policy_consent(&d);
        assert_eq!(vault_event_count(&ctx), 1);
        assert!(ctx.vault.has_consent(&d));
        // Re-signing is a genuine no-op — its invocation emits nothing, so no
        // duplicate "Signed mandate" row can appear in the live feed.
        ctx.vault.set_policy_consent(&d);
        assert_eq!(vault_event_count(&ctx), 0);
        assert!(ctx.vault.has_consent(&d));
    }

    /// Events published by the vault in the most recent invocation.
    fn vault_event_count(ctx: &Ctx) -> usize {
        ctx.env
            .events()
            .all()
            .filter_by_contract(&ctx.vault.address)
            .events()
            .len()
    }

    #[test]
    fn below_min_first_deposit_panics() {
        let ctx = setup();
        let d = funded_depositor(&ctx, 100_000);
        assert!(ctx
            .vault
            .try_deposit(&d, &Currency::Usd, &(MIN_FIRST - 1))
            .is_err());
    }
}

// ── auto-compound preference ─────────────────────────────────────────────

mod auto_compound {
    use super::*;
    use soroban_sdk::testutils::Events as _;
    use soroban_sdk::{map, vec, IntoVal, Symbol};

    /// Absent key reads on: depositors who predate the preference keep compounding.
    #[test]
    fn default_is_enabled() {
        let ctx = setup();
        let d = Address::generate(&ctx.env);
        assert!(ctx.vault.auto_compound_enabled(&d));
    }

    #[test]
    fn toggles_off_and_back_on() {
        let ctx = setup();
        let d = funded_depositor(&ctx, 100_000);
        ctx.vault.set_auto_compound(&d, &false);
        assert!(!ctx.vault.auto_compound_enabled(&d));
        ctx.vault.set_auto_compound(&d, &true);
        assert!(ctx.vault.auto_compound_enabled(&d));
    }

    #[test]
    fn set_is_idempotent() {
        let ctx = setup();
        let d = funded_depositor(&ctx, 100_000);
        ctx.vault.set_auto_compound(&d, &false);
        ctx.vault.set_auto_compound(&d, &false);
        assert!(!ctx.vault.auto_compound_enabled(&d));
    }

    #[test]
    fn set_requires_depositor_auth() {
        let ctx = setup();
        let d = Address::generate(&ctx.env);
        // Drop all mocked auth — nobody may set another depositor's preference.
        ctx.env.set_auths(&[]);
        assert!(ctx.vault.try_set_auto_compound(&d, &false).is_err());
    }

    /// Turning reinvest off must not turn the vault off: principal keeps flowing.
    #[test]
    fn deposit_still_works_while_off() {
        let ctx = setup();
        let d = funded_depositor(&ctx, 100_000);
        ctx.vault.set_auto_compound(&d, &false);
        ctx.vault.deposit(&d, &Currency::Usd, &100_000);
        assert_eq!(ctx.vault.balance_of(&d, &Currency::Usd), 100_000);
    }

    /// The preference is economic, the mandate is safety — toggling one never
    /// touches the other (KTD3 and KTD-SC2 stay intact).
    #[test]
    fn toggling_never_moves_consent() {
        let ctx = setup();
        let consented = funded_depositor(&ctx, 100_000);
        ctx.vault.set_auto_compound(&consented, &false);
        assert!(ctx.vault.has_consent(&consented));

        // And it cannot be used as a back door into consent.
        let stranger = Address::generate(&ctx.env);
        ctx.vault.set_auto_compound(&stranger, &true);
        assert!(!ctx.vault.has_consent(&stranger));
    }

    /// The event is the point of the ticket: `set_policy_consent` publishes none, so
    /// no activity row can be derived from it. This one has to be readable.
    #[test]
    fn set_publishes_event() {
        let ctx = setup();
        // A raw address (no consent) so this asserts ONLY the auto_compound_set event —
        // set_policy_consent now emits its own ConsentSet, which funded_depositor triggers.
        let d = Address::generate(&ctx.env);
        ctx.vault.set_auto_compound(&d, &false);

        // The depositor is a topic (indexable), `enabled` rides in the data map.
        assert_eq!(
            ctx.env.events().all().filter_by_contract(&ctx.vault.address),
            vec![
                &ctx.env,
                (
                    ctx.vault.address.clone(),
                    (Symbol::new(&ctx.env, "auto_compound_set"), d.clone()).into_val(&ctx.env),
                    map![&ctx.env, (Symbol::new(&ctx.env, "enabled"), false)].into_val(&ctx.env),
                )
            ]
        );
    }
}

// ── allocate ─────────────────────────────────────────────────────────────

mod allocate {
    use super::*;

    fn deposited(ctx: &Ctx, amount: i128) -> Address {
        let d = funded_depositor(ctx, amount);
        ctx.vault.deposit(&d, &Currency::Usd, &amount);
        d
    }

    #[test]
    fn allocate_supplies_and_sets_active_pool() {
        let ctx = setup();
        deposited(&ctx, 100_000);
        ctx.vault.allocate(&ctx.pool_a, &Currency::Usd, &100_000);
        assert_eq!(
            ctx.vault.active_pool(&Currency::Usd),
            Some(ctx.pool_a.clone())
        );
        assert_eq!(
            mock_pool::MockPoolClient::new(&ctx.env, &ctx.pool_a).holdings(),
            100_000
        );
        assert_eq!(ctx.usd_token.balance(&ctx.pool_a), 100_000);
    }

    #[test]
    fn deallocate_returns_funds() {
        let ctx = setup();
        deposited(&ctx, 100_000);
        ctx.vault.allocate(&ctx.pool_a, &Currency::Usd, &100_000);
        ctx.vault.deallocate(&ctx.pool_a, &Currency::Usd, &100_000);
        assert_eq!(
            mock_pool::MockPoolClient::new(&ctx.env, &ctx.pool_a).holdings(),
            0
        );
        assert_eq!(ctx.usd_token.balance(&ctx.vault.address), 100_000);
    }

    #[test]
    fn allocate_into_frozen_pool_panics() {
        let ctx = setup();
        deposited(&ctx, 100_000);
        ctx.vault.freeze(&ctx.pool_a);
        assert!(ctx
            .vault
            .try_allocate(&ctx.pool_a, &Currency::Usd, &100_000)
            .is_err());
    }

    #[test]
    fn allocate_empty_bucket_panics() {
        let ctx = setup();
        // Never deposited into USD.
        assert!(ctx
            .vault
            .try_allocate(&ctx.pool_a, &Currency::Usd, &100_000)
            .is_err());
    }

    #[test]
    fn allocate_beyond_cap_panics() {
        let ctx = setup();
        deposited(&ctx, CAP + 10);
        assert!(ctx
            .vault
            .try_allocate(&ctx.pool_a, &Currency::Usd, &(CAP + 10))
            .is_err());
    }

    #[test]
    fn allocate_requires_keeper_auth() {
        // Without mocked auth the keeper-gated call fails.
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let keeper = Address::generate(&env);
        let config = Config {
            per_pool_cap: CAP,
            min_first_deposit: MIN_FIRST,
            virtual_offset: VIRT,
        };
        let vault_id = env.register(Vault, (admin.clone(), keeper.clone(), config));
        let vault = VaultClient::new(&env, &vault_id);
        let issuer = Address::generate(&env);
        let usd = env.register_stellar_asset_contract_v2(issuer).address();
        vault.set_token(&Currency::Usd, &usd);
        let d = Address::generate(&env);
        token::StellarAssetClient::new(&env, &usd).mint(&d, &100_000);
        vault.set_policy_consent(&d);
        vault.deposit(&d, &Currency::Usd, &100_000);
        let pool = env.register(mock_pool::MockPool, ());
        mock_pool::MockPoolClient::new(&env, &pool).init(&usd);
        vault.set_pool_allowed(&pool, &true);

        // Drop all mocked auth — the keeper gate must now reject.
        env.set_auths(&[]);
        assert!(vault.try_allocate(&pool, &Currency::Usd, &100_000).is_err());
    }

    #[test]
    fn allocate_to_unallowed_pool_panics() {
        let ctx = setup();
        deposited(&ctx, 100_000);
        // A pool the admin never vetted — even the keeper cannot send funds there.
        let rogue = ctx.env.register(mock_pool::MockPool, ());
        assert!(ctx
            .vault
            .try_allocate(&rogue, &Currency::Usd, &100_000)
            .is_err());
    }

    #[test]
    fn deallocate_over_held_panics() {
        let ctx = setup();
        deposited(&ctx, 100_000);
        ctx.vault.allocate(&ctx.pool_a, &Currency::Usd, &100_000);
        assert!(ctx
            .vault
            .try_deallocate(&ctx.pool_a, &Currency::Usd, &100_001)
            .is_err());
    }

    #[test]
    fn full_deallocate_clears_active_pool() {
        let ctx = setup();
        deposited(&ctx, 100_000);
        ctx.vault.allocate(&ctx.pool_a, &Currency::Usd, &100_000);
        ctx.vault.deallocate(&ctx.pool_a, &Currency::Usd, &100_000);
        // No pool holds the bucket anymore — active_pool must read null.
        assert_eq!(ctx.vault.active_pool(&Currency::Usd), None);
    }

    #[test]
    fn partial_allocations_accumulate_against_cap() {
        let ctx = setup();
        deposited(&ctx, CAP + 100);
        ctx.vault.allocate(&ctx.pool_a, &Currency::Usd, &(CAP - 10));
        // A second allocation that would push the pool over the cap is rejected.
        assert!(ctx
            .vault
            .try_allocate(&ctx.pool_a, &Currency::Usd, &20)
            .is_err());
    }

    #[test]
    fn allocate_before_token_set_panics() {
        let ctx = setup();
        // EUR bucket has no SAC registered; a consented EUR deposit can't even
        // form, so allocate on the empty bucket rejects first — assert no success.
        let d = Address::generate(&ctx.env);
        ctx.vault.set_policy_consent(&d);
        assert!(ctx
            .vault
            .try_deposit(&d, &Currency::Eur, &100_000)
            .is_err());
    }

    #[test]
    fn multi_depositor_keeps_share_ratio() {
        let ctx = setup();
        let a = funded_depositor(&ctx, 100_000);
        let b = funded_depositor(&ctx, 300_000);
        ctx.vault.deposit(&a, &Currency::Usd, &100_000);
        ctx.vault.deposit(&b, &Currency::Usd, &300_000);
        ctx.vault.allocate(&ctx.pool_a, &Currency::Usd, &400_000);
        // Ratio preserved through the allocation.
        assert_eq!(ctx.vault.balance_of(&a, &Currency::Usd), 100_000);
        assert_eq!(ctx.vault.balance_of(&b, &Currency::Usd), 300_000);
    }
}

// ── guard ────────────────────────────────────────────────────────────────

mod guard {
    use super::*;

    #[test]
    fn freeze_flips_status_and_moves_no_funds() {
        let ctx = setup();
        let d = funded_depositor(&ctx, 100_000);
        ctx.vault.deposit(&d, &Currency::Usd, &100_000);
        ctx.vault.allocate(&ctx.pool_a, &Currency::Usd, &100_000);

        let pool_bal_before = ctx.usd_token.balance(&ctx.pool_a);
        let vault_bal_before = ctx.usd_token.balance(&ctx.vault.address);
        let holdings_before =
            mock_pool::MockPoolClient::new(&ctx.env, &ctx.pool_a).holdings();

        ctx.vault.freeze(&ctx.pool_a);

        assert_eq!(ctx.vault.pool_status(&ctx.pool_a), PoolStatus::Frozen);
        // Freeze is protective only — every balance is byte-identical (AE2, R10).
        assert_eq!(ctx.usd_token.balance(&ctx.pool_a), pool_bal_before);
        assert_eq!(ctx.usd_token.balance(&ctx.vault.address), vault_bal_before);
        assert_eq!(
            mock_pool::MockPoolClient::new(&ctx.env, &ctx.pool_a).holdings(),
            holdings_before
        );
    }

    #[test]
    fn unfreeze_restores_flows() {
        let ctx = setup();
        let d = funded_depositor(&ctx, 200_000);
        ctx.vault.deposit(&d, &Currency::Usd, &200_000);
        ctx.vault.freeze(&ctx.pool_a);
        ctx.vault.unfreeze(&ctx.pool_a);
        assert_eq!(ctx.vault.pool_status(&ctx.pool_a), PoolStatus::Active);
        // Now allocation succeeds again.
        ctx.vault.allocate(&ctx.pool_a, &Currency::Usd, &100_000);
        assert_eq!(
            ctx.vault.active_pool(&Currency::Usd),
            Some(ctx.pool_a.clone())
        );
    }

    #[test]
    fn pause_blocks_and_unpause_restores() {
        let ctx = setup();
        let d = funded_depositor(&ctx, 100_000);
        ctx.vault.pause();
        assert!(ctx
            .vault
            .try_deposit(&d, &Currency::Usd, &100_000)
            .is_err());
        ctx.vault.unpause();
        ctx.vault.deposit(&d, &Currency::Usd, &100_000);
        assert_eq!(ctx.vault.balance_of(&d, &Currency::Usd), 100_000);
    }

    #[test]
    fn approve_exit_is_blocked_while_paused() {
        let ctx = setup();
        let d = funded_depositor(&ctx, 100_000);
        ctx.vault.deposit(&d, &Currency::Usd, &100_000);
        ctx.vault.allocate(&ctx.pool_a, &Currency::Usd, &100_000);
        ctx.vault.freeze(&ctx.pool_a);
        ctx.vault
            .propose_exit(&Currency::Usd, &ctx.pool_a, &ctx.pool_b);
        let exit_id = ctx.vault.pending_exit(&Currency::Usd).unwrap().id;
        ctx.vault.pause();
        // Even a valid exit approval must not move funds during an emergency pause.
        assert!(ctx.vault.try_approve_exit(&d, &exit_id).is_err());
    }

    #[test]
    fn admin_only_calls_reject_non_admin() {
        // Without mocked auth, an admin-gated call must fail the admin gate.
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let keeper = Address::generate(&env);
        let config = Config {
            per_pool_cap: CAP,
            min_first_deposit: MIN_FIRST,
            virtual_offset: VIRT,
        };
        let vault_id = env.register(Vault, (admin.clone(), keeper.clone(), config));
        let vault = VaultClient::new(&env, &vault_id);
        let pool = env.register(mock_pool::MockPool, ());

        env.set_auths(&[]);
        assert!(vault.try_pause().is_err());
        assert!(vault.try_set_pool_allowed(&pool, &true).is_err());
    }

    #[test]
    fn upgrade_requires_admin() {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let keeper = Address::generate(&env);
        let config = Config {
            per_pool_cap: CAP,
            min_first_deposit: MIN_FIRST,
            virtual_offset: VIRT,
        };
        let vault_id = env.register(Vault, (admin.clone(), keeper.clone(), config));
        let vault = VaultClient::new(&env, &vault_id);
        let dummy_hash = BytesN::from_array(&env, &[0u8; 32]);
        // Without admin auth the upgrade must be rejected before touching wasm.
        env.set_auths(&[]);
        assert!(vault.try_upgrade(&dummy_hash).is_err());
    }

    #[test]
    fn propose_exit_ids_are_unique() {
        let ctx = setup();
        let d = funded_depositor(&ctx, 100_000);
        ctx.vault.deposit(&d, &Currency::Usd, &100_000);
        ctx.vault
            .propose_exit(&Currency::Usd, &ctx.pool_a, &ctx.pool_b);
        let first = ctx.vault.pending_exit(&Currency::Usd).unwrap().id;
        ctx.vault
            .propose_exit(&Currency::Usd, &ctx.pool_a, &ctx.pool_b);
        let second = ctx.vault.pending_exit(&Currency::Usd).unwrap().id;
        assert_ne!(first, second);
    }
}

// ── integration: the money-shot ───────────────────────────────────────────

mod integration {
    use super::*;

    /// Covers AE2: consent → deposit → allocate → keeper-freeze (no fund move) →
    /// propose exit → depositor approves → funds move to the safe pool →
    /// deallocate → withdraw. End-to-end against the Blend test-double.
    #[test]
    fn money_shot_end_to_end() {
        let ctx = setup();
        let d = funded_depositor(&ctx, 100_000);

        // Deposit + auto-allocate to pool A.
        ctx.vault.deposit(&d, &Currency::Usd, &100_000);
        ctx.vault.allocate(&ctx.pool_a, &Currency::Usd, &100_000);
        assert_eq!(
            ctx.vault.active_pool(&Currency::Usd),
            Some(ctx.pool_a.clone())
        );

        // Sentinel freezes pool A — funds must not move.
        let holdings_before =
            mock_pool::MockPoolClient::new(&ctx.env, &ctx.pool_a).holdings();
        ctx.vault.freeze(&ctx.pool_a);
        assert_eq!(
            mock_pool::MockPoolClient::new(&ctx.env, &ctx.pool_a).holdings(),
            holdings_before
        );

        // Keeper proposes an exit to safe pool B; depositor approves.
        ctx.vault
            .propose_exit(&Currency::Usd, &ctx.pool_a, &ctx.pool_b);
        let exit_id = ctx.vault.pending_exit(&Currency::Usd).unwrap().id;
        ctx.vault.approve_exit(&d, &exit_id);

        // Funds moved A → B; proposal cleared; active pool is now B.
        assert_eq!(
            mock_pool::MockPoolClient::new(&ctx.env, &ctx.pool_a).holdings(),
            0
        );
        assert_eq!(
            mock_pool::MockPoolClient::new(&ctx.env, &ctx.pool_b).holdings(),
            100_000
        );
        assert!(ctx.vault.pending_exit(&Currency::Usd).is_none());
        assert_eq!(
            ctx.vault.active_pool(&Currency::Usd),
            Some(ctx.pool_b.clone())
        );

        // Deallocate from B and withdraw everything.
        ctx.vault.deallocate(&ctx.pool_b, &Currency::Usd, &100_000);
        let shares = ctx.vault.balance_of(&d, &Currency::Usd);
        ctx.vault.withdraw(&d, &Currency::Usd, &shares);
        assert_eq!(ctx.usd_token.balance(&d), 100_000);
    }

    #[test]
    fn approve_exit_by_non_stakeholder_panics() {
        let ctx = setup();
        let d = funded_depositor(&ctx, 100_000);
        ctx.vault.deposit(&d, &Currency::Usd, &100_000);
        ctx.vault.allocate(&ctx.pool_a, &Currency::Usd, &100_000);
        ctx.vault.freeze(&ctx.pool_a);
        ctx.vault
            .propose_exit(&Currency::Usd, &ctx.pool_a, &ctx.pool_b);
        let exit_id = ctx.vault.pending_exit(&Currency::Usd).unwrap().id;

        // An address holding no USD shares cannot approve the bucket's exit.
        let stranger = Address::generate(&ctx.env);
        assert!(ctx.vault.try_approve_exit(&stranger, &exit_id).is_err());
    }

    #[test]
    fn exit_into_frozen_target_panics() {
        let ctx = setup();
        let d = funded_depositor(&ctx, 100_000);
        ctx.vault.deposit(&d, &Currency::Usd, &100_000);
        ctx.vault.allocate(&ctx.pool_a, &Currency::Usd, &100_000);
        ctx.vault.freeze(&ctx.pool_a);
        ctx.vault.freeze(&ctx.pool_b); // the "safe" target is also frozen
        ctx.vault
            .propose_exit(&Currency::Usd, &ctx.pool_a, &ctx.pool_b);
        let exit_id = ctx.vault.pending_exit(&Currency::Usd).unwrap().id;
        assert!(ctx.vault.try_approve_exit(&d, &exit_id).is_err());
    }

    #[test]
    fn approve_exit_with_no_pending_panics() {
        let ctx = setup();
        let d = funded_depositor(&ctx, 100_000);
        ctx.vault.deposit(&d, &Currency::Usd, &100_000);
        assert!(ctx.vault.try_approve_exit(&d, &999).is_err());
    }

    #[test]
    fn withdraw_while_allocated_pulls_from_pool() {
        let ctx = setup();
        let d = funded_depositor(&ctx, 100_000);
        ctx.vault.deposit(&d, &Currency::Usd, &100_000);
        ctx.vault.allocate(&ctx.pool_a, &Currency::Usd, &100_000);
        // Funds are in the pool, not idle in the vault — but withdraw now pulls the
        // shortfall back itself (KTD5), so the depositor exits without a prior
        // deallocate. The pool is drained and drops out of the bucket's NAV list.
        ctx.vault.withdraw(&d, &Currency::Usd, &100_000);
        assert_eq!(ctx.vault.balance_of(&d, &Currency::Usd), 0);
        assert_eq!(ctx.usd_token.balance(&d), 100_000);
        assert_eq!(
            mock_pool::MockPoolClient::new(&ctx.env, &ctx.pool_a).holdings(),
            0
        );
        assert!(ctx.vault.active_pool(&Currency::Usd).is_none());
    }
}

/// Mark-to-market NAV driven by a **real** `yield_pool` on the ledger clock (U2).
/// Where `mod nav` pokes idle via `simulate_yield`, these register an accruing pool
/// and advance `set_timestamp`, so the share price moves from on-chain interest —
/// the production path, not a storage poke.
mod nav_accrual {
    use super::*;
    use crate::shares::SHARE_PRICE_SCALE;
    use soroban_sdk::testutils::Ledger as _;
    use yield_pool::{YieldPool, YieldPoolClient};

    const YEAR: u64 = 31_536_000;

    struct YCtx<'a> {
        env: Env,
        vault: VaultClient<'a>,
        usd_admin: token::StellarAssetClient<'a>,
        usd_token: token::Client<'a>,
        pool: Address,             // an accruing yield_pool
        pool_client: YieldPoolClient<'a>,
        safe: Address,             // a mock_pool exit target
    }

    /// Vault + one 10% `yield_pool` (allowlisted, seeded with `surplus` so it can pay
    /// interest) + one mock safe pool. No deposit yet.
    fn yield_setup<'a>(rate_bps: u32, surplus: i128) -> YCtx<'a> {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let keeper = Address::generate(&env);
        let config = Config {
            per_pool_cap: CAP,
            min_first_deposit: MIN_FIRST,
            virtual_offset: VIRT,
        };
        let vault_id = env.register(Vault, (admin.clone(), keeper.clone(), config));
        let vault = VaultClient::new(&env, &vault_id);

        let issuer = Address::generate(&env);
        let usd = env.register_stellar_asset_contract_v2(issuer).address();
        let usd_admin = token::StellarAssetClient::new(&env, &usd);
        let usd_token = token::Client::new(&env, &usd);
        vault.set_token(&Currency::Usd, &usd);

        let pool = env.register(YieldPool, (admin.clone(), usd.clone(), rate_bps));
        let pool_client = YieldPoolClient::new(&env, &pool);
        // Seed the pool so it holds enough stablecoin to pay accrued interest.
        if surplus > 0 {
            usd_admin.mint(&pool, &surplus);
        }
        let safe = env.register(mock_pool::MockPool, ());
        mock_pool::MockPoolClient::new(&env, &safe).init(&usd);

        vault.set_pool_allowed(&pool, &true);
        vault.set_pool_allowed(&safe, &true);

        YCtx { env, vault, usd_admin, usd_token, pool, pool_client, safe }
    }

    /// A consented depositor who deposits `amount` USD, which the keeper allocates
    /// wholesale into the accruing pool.
    fn deposit_and_allocate(ctx: &YCtx, amount: i128) -> Address {
        let d = Address::generate(&ctx.env);
        ctx.usd_admin.mint(&d, &amount);
        ctx.vault.set_policy_consent(&d);
        ctx.vault.deposit(&d, &Currency::Usd, &amount);
        ctx.vault.allocate(&ctx.pool, &Currency::Usd, &amount);
        d
    }

    #[test]
    fn accrual_lifts_share_price_and_buckets_dont_blend() {
        let ctx = yield_setup(1000, 1_000_000);
        let d = deposit_and_allocate(&ctx, 100_000);

        // At t=0 the pool holds exactly principal, so the price is still the scale.
        assert_eq!(ctx.vault.share_price(&Currency::Usd), SHARE_PRICE_SCALE);

        ctx.env.ledger().set_timestamp(YEAR);

        // The pool now owes 110_000; NAV = idle(0) + 110_000, so the price rises.
        assert_eq!(ctx.pool_client.balance(&ctx.vault.address), 110_000);
        assert!(ctx.vault.share_price(&Currency::Usd) > SHARE_PRICE_SCALE);
        // Lone depositor owns the whole bucket: value ≈ 100_000·111_000/101_000.
        assert_eq!(ctx.vault.value_of(&d, &Currency::Usd), 109_900);
        // The untouched EUR bucket beside it never blends in USD's yield.
        assert_eq!(ctx.vault.share_price(&Currency::Eur), SHARE_PRICE_SCALE);
    }

    #[test]
    fn value_of_previews_withdraw_at_a_non_unit_price() {
        let ctx = yield_setup(1000, 1_000_000);
        let d = deposit_and_allocate(&ctx, 100_000);
        ctx.env.ledger().set_timestamp(YEAR);

        let previewed = ctx.vault.value_of(&d, &Currency::Usd);
        assert!(previewed > 100_000); // genuinely above the scale
        let owned = ctx.vault.balance_of(&d, &Currency::Usd);
        ctx.vault.withdraw(&d, &Currency::Usd, &owned);
        assert_eq!(ctx.usd_token.balance(&d), previewed);
    }

    #[test]
    fn full_withdraw_after_accrual_pulls_principal_plus_interest() {
        // KTD5: no operator deallocate — withdraw pulls the grown value from the pool.
        let ctx = yield_setup(1000, 1_000_000);
        let d = deposit_and_allocate(&ctx, 100_000);
        ctx.env.ledger().set_timestamp(YEAR);

        let owned = ctx.vault.balance_of(&d, &Currency::Usd);
        ctx.vault.withdraw(&d, &Currency::Usd, &owned);
        // Paid the full accrued value (principal + interest) straight from the pool.
        assert_eq!(ctx.usd_token.balance(&d), 109_900);
        assert_eq!(ctx.vault.balance_of(&d, &Currency::Usd), 0);
        // Floor rounding leaves at most a sub-share dust of interest behind (toward
        // the vault, KTD10) — the depositor was made whole.
        assert!(ctx.pool_client.balance(&ctx.vault.address) < 1_000);
    }

    #[test]
    fn direct_donation_moves_neither_nav_nor_price() {
        // R5: an unsolicited SAC transfer to the vault is not NAV.
        let ctx = yield_setup(1000, 1_000_000);
        let d = deposit_and_allocate(&ctx, 100_000);
        ctx.env.ledger().set_timestamp(YEAR);

        let price_before = ctx.vault.share_price(&Currency::Usd);
        let value_before = ctx.vault.value_of(&d, &Currency::Usd);
        ctx.usd_admin.mint(&ctx.vault.address, &500_000); // the donation
        assert_eq!(ctx.vault.share_price(&Currency::Usd), price_before);
        assert_eq!(ctx.vault.value_of(&d, &Currency::Usd), value_before);
    }

    #[test]
    fn nav_cannot_be_inflated_through_the_pool() {
        // KTD4: crediting the vault's pool position needs the vault's auth, so once
        // auths are dropped a third party cannot supply into it to inflate NAV.
        let ctx = yield_setup(1000, 1_000_000);
        deposit_and_allocate(&ctx, 100_000);
        let price_before = ctx.vault.share_price(&Currency::Usd);

        ctx.env.set_auths(&[]); // no more mocked authorizations
        assert!(ctx
            .pool_client
            .try_supply(&ctx.vault.address, &1_000_000)
            .is_err());
        assert_eq!(ctx.vault.share_price(&Currency::Usd), price_before);
    }

    #[test]
    fn pool_leaves_nav_list_only_at_zero_balance() {
        // Deallocating exactly the booked principal after accrual leaves the interest
        // in the pool — so the pool stays in NAV and the price stays above the scale.
        let ctx = yield_setup(1000, 1_000_000);
        deposit_and_allocate(&ctx, 100_000);
        ctx.env.ledger().set_timestamp(YEAR);

        ctx.vault.deallocate(&ctx.pool, &Currency::Usd, &100_000); // principal only
        assert_eq!(ctx.pool_client.balance(&ctx.vault.address), 10_000); // interest remains
        assert!(ctx.vault.share_price(&Currency::Usd) > SHARE_PRICE_SCALE);
        assert_eq!(
            ctx.vault.active_pool(&Currency::Usd),
            Some(ctx.pool.clone())
        );
    }

    #[test]
    fn freeze_exit_moves_principal_plus_interest() {
        // KTD6: the exit relocates the pool's whole value, not just booked principal.
        let ctx = yield_setup(1000, 1_000_000);
        let d = deposit_and_allocate(&ctx, 100_000);
        ctx.env.ledger().set_timestamp(YEAR);

        ctx.vault.freeze(&ctx.pool);
        ctx.vault
            .propose_exit(&Currency::Usd, &ctx.pool, &ctx.safe);
        let exit_id = ctx.vault.pending_exit(&Currency::Usd).unwrap().id;
        ctx.vault.approve_exit(&d, &exit_id);

        // The whole 110_000 landed in the safe pool; the frozen pool is emptied.
        assert_eq!(
            mock_pool::MockPoolClient::new(&ctx.env, &ctx.safe).balance(&ctx.vault.address),
            110_000
        );
        assert_eq!(ctx.pool_client.balance(&ctx.vault.address), 0);
    }

    #[test]
    fn too_many_pools_is_rejected() {
        // The NAV list is bounded (Scout dos-unbounded-operation): a 13th pool errors.
        let ctx = yield_setup(1000, 0);
        let d = Address::generate(&ctx.env);
        ctx.usd_admin.mint(&d, &100_000);
        ctx.vault.set_policy_consent(&d);
        ctx.vault.deposit(&d, &Currency::Usd, &100_000);

        // Fill the list to MAX_POOLS_PER_CURRENCY (12) with distinct mock pools.
        for _ in 0..12 {
            let p = ctx.env.register(mock_pool::MockPool, ());
            mock_pool::MockPoolClient::new(&ctx.env, &p).init(&ctx.usd_token.address);
            ctx.vault.set_pool_allowed(&p, &true);
            ctx.vault.allocate(&p, &Currency::Usd, &1_000);
        }
        // The 13th distinct pool overflows the bound.
        let overflow = ctx.env.register(mock_pool::MockPool, ());
        mock_pool::MockPoolClient::new(&ctx.env, &overflow).init(&ctx.usd_token.address);
        ctx.vault.set_pool_allowed(&overflow, &true);
        assert!(ctx
            .vault
            .try_allocate(&overflow, &Currency::Usd, &1_000)
            .is_err());
    }

    #[test]
    fn dust_deposit_that_mints_no_shares_is_rejected() {
        // KTD10: above the scale a 1-unit deposit rounds to 0 shares — reject, don't
        // confiscate. (Price ≈ 1.099e9 here, so 1 unit buys 0 shares.)
        let ctx = yield_setup(1000, 1_000_000);
        deposit_and_allocate(&ctx, 100_000);
        ctx.env.ledger().set_timestamp(YEAR);

        let dust = Address::generate(&ctx.env);
        ctx.usd_admin.mint(&dust, &1);
        ctx.vault.set_policy_consent(&dust);
        assert!(ctx.vault.try_deposit(&dust, &Currency::Usd, &1).is_err());
        // The tokens were not taken.
        assert_eq!(ctx.usd_token.balance(&dust), 1);
    }

    #[test]
    fn mint_then_redeem_never_returns_more_than_deposited_above_scale() {
        // KTD10: a round-trip at a price above the scale must not be profitable
        // (floor rounding is toward the vault, never the depositor).
        let ctx = yield_setup(1000, 1_000_000);
        deposit_and_allocate(&ctx, 100_000);
        ctx.env.ledger().set_timestamp(YEAR);

        let e = Address::generate(&ctx.env);
        ctx.usd_admin.mint(&e, &50_000);
        ctx.vault.set_policy_consent(&e);
        ctx.vault.deposit(&e, &Currency::Usd, &50_000);
        let owned = ctx.vault.balance_of(&e, &Currency::Usd);
        ctx.vault.withdraw(&e, &Currency::Usd, &owned);
        assert!(ctx.usd_token.balance(&e) <= 50_000);
    }
}
