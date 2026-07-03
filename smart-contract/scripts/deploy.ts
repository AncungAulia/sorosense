/**
 * Build, deploy, and initialize the SoroSense vault on Stellar testnet (U7).
 *
 * Steps: build WASM → deploy → `init(admin, keeper, config)` → register each
 * currency's stablecoin SAC (`set_token`) and target Blend pool
 * (`set_configured_pool`) → write `VAULT_CONTRACT_ID` back to the repo `.env`.
 *
 * Network + venue addresses come from the environment (KTD-SC1 config seam), so
 * testnet → mainnet is an env change, not a code change. This script performs a
 * real on-chain deploy; it is run by the integration owner at origin U20 with a
 * funded keeper key and real Blend testnet pool addresses — not in CI.
 *
 * Run:  npx tsx smart-contract/scripts/deploy.ts
 *
 * Required env (see .env.example):
 *   STELLAR_NETWORK            e.g. "testnet"
 *   ADMIN_SECRET               deployer/admin secret (S...) — config authority
 *   KEEPER_SECRET              keeper public/secret — Sentinel freeze authority
 *   USDC_SAC, EURC_SAC         stablecoin SAC contract ids per currency
 *   BLEND_POOL_USD, BLEND_POOL_EUR   target Blend pool ids per currency
 * Optional (sane defaults):
 *   PER_POOL_CAP, MIN_FIRST_DEPOSIT, VIRTUAL_OFFSET
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

/** Derive a public key (G...) from a secret via the CLI. */
function publicKey(secret: string): string {
  return execFileSync("stellar", ["keys", "public-key", secret], {
    encoding: "utf8",
  }).trim();
}

function invoke(contractId: string, source: string, fnArgs: string[]): void {
  sh([
    "contract",
    "invoke",
    "--id",
    contractId,
    "--source",
    source,
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
  const adminSecret = need("ADMIN_SECRET");
  const keeperPublic = publicKey(need("KEEPER_SECRET"));
  const adminPublic = publicKey(adminSecret);

  // 1. Build.
  console.log(`$ stellar contract build`);
  execFileSync("stellar", ["contract", "build"], { cwd: contractDir, stdio: "inherit" });

  // 2. Deploy (no constructor — init is a separate call).
  const contractId = sh([
    "contract",
    "deploy",
    "--wasm",
    WASM,
    "--source",
    adminSecret,
    "--network",
    NETWORK,
  ]);
  console.log(`deployed vault: ${contractId}`);

  // 3. init(admin, keeper, config).
  const config = JSON.stringify({
    per_pool_cap: PER_POOL_CAP,
    min_first_deposit: MIN_FIRST_DEPOSIT,
    virtual_offset: VIRTUAL_OFFSET,
  });
  invoke(contractId, adminSecret, [
    "init",
    "--admin",
    adminPublic,
    "--keeper",
    keeperPublic,
    "--config",
    config,
  ]);

  // 4. Register per-currency stablecoin SACs and target Blend pools.
  const buckets: Array<{ currency: string; token: string; pool: string }> = [
    { currency: "Usd", token: need("USDC_SAC"), pool: need("BLEND_POOL_USD") },
    { currency: "Eur", token: need("EURC_SAC"), pool: need("BLEND_POOL_EUR") },
  ];
  for (const b of buckets) {
    invoke(contractId, adminSecret, ["set_token", "--currency", b.currency, "--token", b.token]);
    invoke(contractId, adminSecret, [
      "set_configured_pool",
      "--currency",
      b.currency,
      "--pool",
      b.pool,
    ]);
  }

  // 5. Persist the contract id for the backend/frontend.
  upsertEnv("VAULT_CONTRACT_ID", contractId);
  console.log(`\n✅ Vault live on ${NETWORK}: ${contractId}`);
  console.log("   Next: run smart-contract/scripts/bindings.ts to regenerate the TS client.");
}

main();
