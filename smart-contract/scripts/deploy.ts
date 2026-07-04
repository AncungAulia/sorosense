/**
 * Build, deploy, and initialize the SoroSense vault on Stellar testnet (U7).
 *
 * Steps: build WASM → deploy (the vault's `__constructor` runs atomically in the
 * deploy tx with admin/keeper/config — no separate, front-runnable init) →
 * register each currency's stablecoin SAC (`set_token`), allowlist + target its
 * Blend pool (`set_pool_allowed` + `set_configured_pool`) → write
 * `VAULT_CONTRACT_ID` back to the repo `.env`.
 *
 * Network + venue addresses come from the environment (KTD-SC1 config seam), so
 * testnet → mainnet is an env change, not a code change. This performs a real
 * on-chain deploy; run by the integration owner at origin U20 — not in CI.
 *
 * Run:  node smart-contract/scripts/deploy.ts   (Node >=23 strips TS natively)
 *
 * Required env (see .env.example):
 *   STELLAR_NETWORK                  e.g. "testnet"
 *   ADMIN_IDENTITY, KEEPER_IDENTITY  stellar CLI key names (see `stellar keys`)
 *   USDC_SAC, EURC_SAC               stablecoin SAC contract ids per currency
 *   BLEND_POOL_USD, BLEND_POOL_EUR   Blend pool ids per currency (vetted + allowlisted)
 * Optional (sane defaults): PER_POOL_CAP, MIN_FIRST_DEPOSIT, VIRTUAL_OFFSET
 *
 * Note: MXN ships internal-only for the demo (origin scope), so no MXN token/pool
 * is provisioned here — add it to `buckets` with its own env vars to enable it.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const contractDir = resolve(scriptDir, "..");
const repoRoot = resolve(contractDir, "..");
const ENV_PATH = resolve(repoRoot, ".env");
const WASM = resolve(contractDir, "target/wasm32v1-none/release/vault.wasm");

const NETWORK = process.env.STELLAR_NETWORK ?? "testnet";
const ADMIN_IDENTITY = process.env.ADMIN_IDENTITY ?? "admin";
const KEEPER_IDENTITY = process.env.KEEPER_IDENTITY ?? "keeper";
const PER_POOL_CAP = process.env.PER_POOL_CAP ?? "1000000000000"; // 1e12 base units
const MIN_FIRST_DEPOSIT = process.env.MIN_FIRST_DEPOSIT ?? "1000000"; // 0.1 @ 7dp
const VIRTUAL_OFFSET = process.env.VIRTUAL_OFFSET ?? "1000";

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
  return execFileSync("stellar", ["keys", "public-key", identity], {
    encoding: "utf8",
  }).trim();
}

function invoke(contractId: string, fnArgs: string[]): void {
  sh([
    "contract",
    "invoke",
    "--id",
    contractId,
    "--source",
    ADMIN_IDENTITY,
    "--network",
    NETWORK,
    "--",
    ...fnArgs,
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
  const keeperPublic = publicKey(KEEPER_IDENTITY);

  // 1. Build.
  console.log(`$ stellar contract build`);
  execFileSync("stellar", ["contract", "build"], { cwd: contractDir, stdio: "inherit" });

  // 2. Deploy — __constructor(admin, keeper, config) runs atomically here.
  const config = JSON.stringify({
    per_pool_cap: PER_POOL_CAP,
    min_first_deposit: MIN_FIRST_DEPOSIT,
    virtual_offset: VIRTUAL_OFFSET,
  });
  const contractId = sh([
    "contract",
    "deploy",
    "--wasm",
    WASM,
    "--source",
    ADMIN_IDENTITY,
    "--network",
    NETWORK,
    "--",
    "--admin",
    adminPublic,
    "--keeper",
    keeperPublic,
    "--config",
    config,
  ]);
  console.log(`deployed vault: ${contractId}`);

  // 3. Register per-currency SACs, allowlist + target their Blend pools.
  const buckets: Array<{ currency: string; token: string; pool: string }> = [
    { currency: "Usd", token: need("USDC_SAC"), pool: need("BLEND_POOL_USD") },
    { currency: "Eur", token: need("EURC_SAC"), pool: need("BLEND_POOL_EUR") },
  ];
  for (const b of buckets) {
    invoke(contractId, ["set_token", "--currency", b.currency, "--token", b.token]);
    invoke(contractId, ["set_pool_allowed", "--pool", b.pool, "--allowed", "true"]);
    invoke(contractId, ["set_configured_pool", "--currency", b.currency, "--pool", b.pool]);
  }

  // 4. Persist the contract id for the backend/frontend.
  upsertEnv("VAULT_CONTRACT_ID", contractId);
  console.log(`\n✅ Vault live on ${NETWORK}: ${contractId}`);
  console.log("   Next: run smart-contract/scripts/bindings.ts to regenerate the TS client.");
}

main();
