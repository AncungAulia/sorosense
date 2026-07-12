# SoroSense Vault — Soroban smart contract

Non-custodial per-currency vault: custody + share accounting, keeper/approved
allocation into Blend pools, and a protective Sentinel freeze. It implements the
callable surface in [`packages/vault-client/src/interface.ts`](../packages/vault-client/src/interface.ts) —
the frozen cross-track contract the backend and frontend build against.

## Layout

| Path | What |
| --- | --- |
| `contracts/vault/` | The vault contract (Rust / `soroban-sdk` 26) |
| `contracts/vault/src/lib.rs` | Entrypoints + `init` |
| `contracts/vault/src/storage.rs` | Storage keys + TTL-bumping accessors |
| `contracts/vault/src/shares.rs` | Virtual-offset share math (inflation-attack safe) |
| `contracts/vault/src/allocate.rs` | Blend supply/withdraw + approved exit |
| `contracts/vault/src/guard.rs` | Keeper role + pause checks |
| `contracts/vault/src/blend.rs` | Blend pool client seam (`contractimport`-style) |
| `contracts/mock_pool/` | Blend **test-double** for deterministic `cargo test` |
| `scripts/deploy.ts` | Build + deploy + init on testnet |
| `scripts/bindings.ts` | Generate the TS client into `packages/vault-client/bindings/` |

## Design decisions

- **Consent enforced on-chain (KTD-SC2).** `deposit` panics unless the depositor
  has recorded the one-time `set_policy_consent`, so every principal in a pooled
  bucket is consented and the keeper cannot allocate an unconsented bucket.
- **Auto-compound is a preference, not a consent (KTD3 intact).** `set_policy_consent`
  stays whole, idempotent, and unrevocable — a pooled bucket gives the keeper no way
  to separate one depositor's shares, so a revocable mandate would force it to
  abandon the whole bucket. Instead `set_auto_compound(depositor, enabled)` toggles a
  separate economic preference (`auto_compound_enabled`, **unset reads on**), read by
  the off-chain keeper, which skips reinvestment for depositors who are off while
  allocate/rebalance/freeze-exit run unchanged. The contract records the preference and
  emits `AutoCompoundSet`; it does not enforce it — there is no on-chain compound
  entrypoint, since yield re-supply is a pool-level `allocate` the vault cannot
  attribute per depositor.
- **Inflation-attack safe (KTD-SC3).** NAV comes from internal per-share counters
  (never a live balance query), with a virtual shares/assets offset — a direct
  token donation cannot move the share price.
- **Protective freeze only (KTD-SC4).** `freeze(pool)` is keeper-gated and moves
  zero funds; it blocks new flows into a toxic pool. Funds leave only via a
  keeper-proposed, depositor-approved exit (`propose_exit` → `approve_exit`), and
  the exit is only valid for a frozen source pool.
- **On-chain pool allowlist (KTD-SC1).** Every `allocate`/exit destination is
  checked against an admin-managed allowlist — the Sentinel-vetted Safe set. Even
  a compromised keeper can only move funds into an admin-vetted pool, never to an
  arbitrary address. Set via `set_pool_allowed`.
- **Atomic setup.** `__constructor` runs in the deploy transaction (admin/keeper/
  config), so there is no separate, front-runnable `init`.
- **Blend seam is config-swappable (KTD-SC1).** The vault calls pools through a
  generated client whose address comes from config, so `cargo test` runs against
  the in-repo `mock_pool` and testnet/mainnet is an env change, not a code change.

## Build & test

```bash
# Prereqs: Rust + wasm target, stellar CLI 27.x
cd smart-contract
cargo test              # 23 tests: shares, consent, allocate, guard, integration
stellar contract build  # optimized WASM → target/wasm32v1-none/release/vault.wasm
```

## Generate TypeScript bindings (offline)

```bash
npx tsx smart-contract/scripts/bindings.ts
# → packages/vault-client/bindings/  (adapted to the VaultClient interface at origin U20)
```

## Live testnet deployment

| | |
| --- | --- |
| Contract ID | `CCK5G4FQ53Y7TIQY6CZLOSLCF5DKL44XV2LNFKCMHTSCWNWEAI3D457Y` |
| Network | testnet (`Test SDF Network ; September 2015`) |
| Upgradable | yes — admin-governed `upgrade(new_wasm_hash)` (storage preserved) |
| Explorer | [stellar.expert](https://stellar.expert/explorer/testnet/contract/CCK5G4FQ53Y7TIQY6CZLOSLCF5DKL44XV2LNFKCMHTSCWNWEAI3D457Y) |

Deployed with `__constructor(admin, keeper, config)` and verified live: a consent write/read smoke test **and** an on-chain `upgrade` tx both succeeded. Full record in [`deployments/testnet.json`](deployments/testnet.json). Token + Blend-pool wiring happens at U20 integration. The upgrade key should move behind a timelock/multisig before mainnet (deferred). (Testnet resets ~quarterly — redeploy via the script below.)

## Deploy to testnet

Fill the deploy seam vars in `.env` (see `.env.example`): `ADMIN_SECRET`,
`KEEPER_SECRET`, `USDC_SAC`/`EURC_SAC`, `BLEND_POOL_USD`/`BLEND_POOL_EUR`.

```bash
npx tsx smart-contract/scripts/deploy.ts
# builds, deploys, init + set_token + set_configured_pool, writes VAULT_CONTRACT_ID to .env
```

The demo can re-point a bucket at an engineered risky pool without redeploying via
the admin `set_configured_pool` (the origin U21 Sentinel-trigger seam).

## Testnet faucet assets + demo pools (STE-46)

The demo uses **self-issued** assets coded USDC/EURC wrapped as SAC (not real Circle
tokens) and `mock_pool` test-doubles (real Blend testnet rejects non-Circle assets).
After a testnet reset, re-provision them and wire the vault:

```bash
npx tsx smart-contract/scripts/faucet-assets.ts
# issues USDC/EURC SACs, deploys+init two mock_pools, set_token/set_pool_allowed/
# set_configured_pool, writes USDC_SAC/EURC_SAC/BLEND_POOL_* to .env
```

The issuer **secret** (`stellar keys show <ISSUER_IDENTITY>`) is what the backend
faucet signs mint with — share it over a secure channel, never commit it. Current
testnet ids are recorded in [`deployments/testnet.json`](deployments/testnet.json).
