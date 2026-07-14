/**
 * Ship mark-to-market yield to the live testnet vault (U5): upgrade the deployed vault to the
 * accruing NAV build, deploy a `yield_pool` per currency, allowlist + target each, and write the pool
 * ids back to `.env`. The claim of the whole plan series — a share price that actually moves — becomes
 * true on-chain here.
 *
 * **Order matters and one step is easy to get wrong** (mirrors the plan's U5):
 *   1. `stellar contract build` — the new vault + yield_pool WASM.
 *   2. **Upgrade the vault FIRST**, before any allocation. Storage is preserved and, with no pool
 *      position yet, the upgraded vault reads identically to 1.2.0 — observably inert, which is what
 *      makes it safe on a vault holding real testnet deposits.
 *   3. Deploy `yield_pool(admin, <CCY>_SAC, DEFAULT_YIELD_RATE_BPS)`; `set_pool_allowed`;
 *      `set_configured_pool`.
 *   4. Write `YIELD_POOL_<CCY>` back to `.env`.
 *
 * **Two follow-up steps are deliberately NOT in this script** (they need a different signer / a wait,
 * and are printed as the next actions):
 *   - **Fund the pool's surplus (R11):** the faucet issuer mints USDC *to the pool's address* so it can
 *     pay the interest it promises — a pool that cannot pay panics on the first withdrawal. `liquidity()`
 *     proves it can. Run the faucet mint (issuer-signed) after this script.
 *   - **Allocate (keeper-signed):** `pnpm -C backend keeper allocate USD <amount>` moves idle funds in,
 *     so `active_pool(USD)` stops reading `null` and accrual starts.
 *
 * Everything here is admin-gated, so it signs with the vault's `ADMIN_IDENTITY` (the same stellar CLI
 * key that deployed the vault) — exactly like `deploy.ts`. This performs REAL on-chain writes on a live
 * contract; run it by the deploy owner, never in CI.
 *
 * Run:  node smart-contract/scripts/deploy-yield-pool.ts   (Node >=23 strips TS natively)
 *
 * Required env (see .env.example):
 *   STELLAR_NETWORK                 e.g. "testnet"
 *   ADMIN_IDENTITY                  stellar CLI key that governs the deployed vault
 *   VAULT_CONTRACT_ID               the live vault to upgrade
 *   USDC_SAC, EURC_SAC              stablecoin SAC contract ids per currency
 * Optional: YIELD_RATE_BPS (default 1000 = 10%), YIELD_CURRENCIES ("USD,EUR")
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const contractDir = resolve(scriptDir, "..");
const repoRoot = resolve(contractDir, "..");
const ENV_PATH = resolve(repoRoot, ".env");
const VAULT_WASM = resolve(contractDir, "target/wasm32v1-none/release/vault.wasm");
const POOL_WASM = resolve(contractDir, "target/wasm32v1-none/release/yield_pool.wasm");

const NETWORK = process.env.STELLAR_NETWORK ?? "testnet";
const ADMIN_IDENTITY = process.env.ADMIN_IDENTITY ?? "admin";
/** 1000 bps = 10%. Must equal the seam's DEFAULT_YIELD_RATE_BPS (KTD8) — the offline fallback mirrors it. */
const RATE_BPS = process.env.YIELD_RATE_BPS ?? "1000";

/** (seam currency, its SAC env var, its YIELD_POOL_<CCY> env key, the contract's Currency variant). */
const BUCKETS: Array<{ currency: string; sacEnv: string; poolEnv: string; variant: string }> = [
  { currency: "USD", sacEnv: "USDC_SAC", poolEnv: "YIELD_POOL_USD", variant: "Usd" },
  { currency: "EUR", sacEnv: "EURC_SAC", poolEnv: "YIELD_POOL_EUR", variant: "Eur" },
];

function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function sh(args: string[]): string {
  console.log(`$ stellar ${args.join(" ")}`);
  return execFileSync("stellar", args, { cwd: repoRoot, encoding: "utf8" }).trim();
}

/** Resolve a configured CLI identity's public key (G...). */
function publicKey(identity: string): string {
  return execFileSync("stellar", ["keys", "public-key", identity], { encoding: "utf8" }).trim();
}

function invoke(contractId: string, fnArgs: string[]): string {
  return sh([
    "contract", "invoke",
    "--id", contractId,
    "--source", ADMIN_IDENTITY,
    "--network", NETWORK,
    "--", ...fnArgs,
  ]);
}

function upsertEnv(key: string, value: string): void {
  let body = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, "utf8") : "";
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, "m");
  body = re.test(body) ? body.replace(re, line) : `${body.trimEnd()}\n${line}\n`;
  writeFileSync(ENV_PATH, body);
  console.log(`wrote ${key} to .env`);
}

function main(): void {
  const adminPublic = publicKey(ADMIN_IDENTITY);
  const vaultId = need("VAULT_CONTRACT_ID");

  // 1. Build both WASMs.
  console.log(`$ stellar contract build`);
  execFileSync("stellar", ["contract", "build"], { cwd: contractDir, stdio: "inherit" });

  // 2. Upgrade the vault FIRST (inert with no pool position — safe on live deposits).
  const wasmHash = sh([
    "contract", "upload",
    "--wasm", VAULT_WASM,
    "--source", ADMIN_IDENTITY,
    "--network", NETWORK,
  ]);
  console.log(`uploaded vault wasm: ${wasmHash}`);
  invoke(vaultId, ["upgrade", "--new_wasm_hash", wasmHash]);
  console.log(`upgraded vault ${vaultId} → binver 1.3.0 (mark-to-market NAV)`);

  // 3. Deploy a yield_pool per currency; allowlist + target it.
  for (const b of BUCKETS) {
    const token = need(b.sacEnv);
    const poolId = sh([
      "contract", "deploy",
      "--wasm", POOL_WASM,
      "--source", ADMIN_IDENTITY,
      "--network", NETWORK,
      "--",
      "--admin", adminPublic,
      "--token", token,
      "--rate_bps", RATE_BPS,
    ]);
    console.log(`deployed ${b.currency} yield_pool: ${poolId} (rate ${RATE_BPS} bps)`);

    invoke(vaultId, ["set_pool_allowed", "--pool", poolId, "--allowed", "true"]);
    invoke(vaultId, ["set_configured_pool", "--currency", b.variant, "--pool", poolId]);

    // 4. Persist for the backend registry (buildPoolRegistry reads YIELD_POOL_<CCY>).
    upsertEnv(b.poolEnv, poolId);
  }

  console.log(`\n✅ Vault upgraded and yield pools live on ${NETWORK}.`);
  console.log("   NEXT (not done here — different signer / a wait):");
  console.log("   1. Fund each pool's surplus: faucet-issuer mint USDC to the pool address (R11).");
  console.log("   2. Allocate: pnpm -C backend keeper allocate USD <amount>  (active_pool stops being null).");
  console.log("   3. Wait, then read: rate_bps() == 1000, balance(vault) grows, share_price(USD) > 1e9.");
  console.log("   Record the wasm hash + pool ids in smart-contract/deployments/testnet.json.");
}

main();
