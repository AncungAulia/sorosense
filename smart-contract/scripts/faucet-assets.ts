/**
 * Set up the testnet faucet assets + demo pools and wire them into the vault (STE-46).
 *
 * For the demo we do NOT use real Circle USDC/EURC or real Blend testnet pools —
 * Blend testnet rejects non-Circle assets. Instead we self-issue assets coded
 * USDC/EURC from our own issuer, wrap them as SAC, and point the vault at
 * `mock_pool` test-doubles so the U20 journey (deposit → allocate → freeze → exit)
 * is deterministic. Real Blend is post-hackathon (adapt `blend.rs`).
 *
 * Idempotent-ish: `contract asset deploy` returns the (deterministic) SAC id even
 * if already deployed; pool deploys mint fresh ids each run, so re-running after a
 * testnet reset gives a clean set. Writes the resolved ids back to the repo `.env`.
 *
 * Run:  node smart-contract/scripts/faucet-assets.ts   (Node >=23 strips TS)
 *
 * Required env (see .env.example):
 *   STELLAR_NETWORK                testnet
 *   ISSUER_IDENTITY               stellar CLI key that issues USDC/EURC (secret is
 *                                 backend-only; hand to the faucet service securely)
 *   ADMIN_IDENTITY               vault admin key (wires set_token/allow/configured)
 *   VAULT_CONTRACT_ID            the deployed vault
 *
 * The issuer's SECRET is what the backend faucet (STE-45) signs mint with. Reveal it
 * with `stellar keys show <ISSUER_IDENTITY>` and share it over a secure channel —
 * never commit it.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const contractDir = resolve(scriptDir, "..");
const repoRoot = resolve(contractDir, "..");
const ENV_PATH = resolve(repoRoot, ".env");
const MOCK_POOL_WASM = resolve(
  contractDir,
  "target/wasm32v1-none/release/mock_pool.wasm",
);

const NETWORK = process.env.STELLAR_NETWORK ?? "testnet";
const ISSUER = process.env.ISSUER_IDENTITY ?? "ss-issuer";
const ADMIN = process.env.ADMIN_IDENTITY ?? "ss-admin";

function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function sh(source: string, args: string[]): string {
  console.log(`$ stellar ${args.join(" ")}  (source: ${source})`);
  return execFileSync(
    "stellar",
    [...args, "--source", source, "--network", NETWORK],
    { cwd: repoRoot, encoding: "utf8" },
  ).trim();
}

function pub(identity: string): string {
  return execFileSync("stellar", ["keys", "public-key", identity], {
    encoding: "utf8",
  }).trim();
}

function invokeVault(vault: string, fnArgs: string[]): void {
  sh(ADMIN, ["contract", "invoke", "--id", vault, "--", ...fnArgs]);
}

function upsertEnv(entries: Record<string, string>): void {
  let body = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, "utf8") : "";
  for (const [key, value] of Object.entries(entries)) {
    const line = `${key}=${value}`;
    const re = new RegExp(`^${key}=.*$`, "m");
    body = re.test(body) ? body.replace(re, line) : `${body.trimEnd()}\n${line}\n`;
  }
  writeFileSync(ENV_PATH, body);
  console.log(`wrote ${Object.keys(entries).join(", ")} to .env`);
}

function main(): void {
  const vault = need("VAULT_CONTRACT_ID");
  const issuerPub = pub(ISSUER);

  // 1. Self-issue USDC + EURC and wrap each as SAC.
  const usdcSac = sh(ISSUER, ["contract", "asset", "deploy", "--asset", `USDC:${issuerPub}`]);
  const eurcSac = sh(ISSUER, ["contract", "asset", "deploy", "--asset", `EURC:${issuerPub}`]);
  console.log(`USDC_SAC=${usdcSac}\nEURC_SAC=${eurcSac}`);

  // 2. Deploy a mock_pool per currency and init it with the SAC.
  const buckets = [
    { currency: "Usd", sac: usdcSac, poolEnv: "BLEND_POOL_USD" },
    { currency: "Eur", sac: eurcSac, poolEnv: "BLEND_POOL_EUR" },
  ];
  const resolved: Record<string, string> = { USDC_SAC: usdcSac, EURC_SAC: eurcSac };

  for (const b of buckets) {
    const pool = sh(ADMIN, ["contract", "deploy", "--wasm", MOCK_POOL_WASM]);
    sh(ADMIN, ["contract", "invoke", "--id", pool, "--", "init", "--token", b.sac]);
    // 3. Wire the vault: token + allowlist + configured pool.
    invokeVault(vault, ["set_token", "--currency", b.currency, "--token", b.sac]);
    invokeVault(vault, ["set_pool_allowed", "--pool", pool, "--allowed", "true"]);
    invokeVault(vault, ["set_configured_pool", "--currency", b.currency, "--pool", pool]);
    resolved[b.poolEnv] = pool;
    console.log(`${b.currency} → SAC ${b.sac}, mock_pool ${pool}`);
  }

  // 4. Persist for the backend/frontend.
  upsertEnv(resolved);
  console.log(`\n✅ Faucet assets + pools wired into vault ${vault} on ${NETWORK}.`);
  console.log(
    `   Issuer public: ${issuerPub}. Backend faucet mints via the issuer SECRET ` +
      `(\`stellar keys show ${ISSUER}\`) — share it securely, never commit.`,
  );
  console.log("   MXN is internal-only for the demo (no token/pool).");
}

main();
