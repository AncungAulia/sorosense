/**
 * Generate the vault's TypeScript bindings (U7).
 *
 * Builds the contract to WASM and runs `stellar contract bindings typescript`
 * to emit a generated client package into `packages/vault-client/bindings/`.
 * This is offline (spec is read from the WASM) — no deploy or network needed.
 *
 * At origin U20 the integration owner adapts this generated client to the
 * hand-written `VaultClient` interface in `packages/vault-client/src/interface.ts`
 * and swaps it in for the mock. Kept in a `bindings/` subdir so it never clobbers
 * the interface/mock that the whole team builds against.
 *
 * Run:  npx tsx smart-contract/scripts/bindings.ts
 */

import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const contractDir = resolve(scriptDir, "..");
const repoRoot = resolve(contractDir, "..");

const WASM = resolve(
  contractDir,
  "target/wasm32v1-none/release/vault.wasm",
);
const OUT_DIR = resolve(repoRoot, "packages/vault-client/bindings");

function run(cmd: string, args: string[], cwd: string): void {
  console.log(`$ ${cmd} ${args.join(" ")}`);
  execFileSync(cmd, args, { cwd, stdio: "inherit" });
}

function main(): void {
  // 1. Build the optimized WASM.
  run("stellar", ["contract", "build"], contractDir);

  // 2. Generate the TypeScript client from the WASM spec (offline).
  run(
    "stellar",
    [
      "contract",
      "bindings",
      "typescript",
      "--wasm",
      WASM,
      "--output-dir",
      OUT_DIR,
      "--overwrite",
    ],
    repoRoot,
  );

  console.log(`\n✅ Bindings generated at packages/vault-client/bindings`);
  console.log(
    "   Next (origin U20): adapt the generated Client to the VaultClient interface and replace the mock.",
  );
}

main();
