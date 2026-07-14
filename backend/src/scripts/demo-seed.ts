/**
 * Demo seed script (U1, live-testnet-demo) — the on-chain proof that the deployed vault accepts the
 * depositor journey, end to end, headlessly:
 *
 *   keypair → friendbot → changeTrust → SAC mint → consent → deposit → read back shares/value
 *
 * It is a **falsifier, not a fixture**: every step checks the chain before acting, so a re-run is a
 * no-op where it should be (R1) and the run prints the public key, each transaction hash with an
 * explorer link, and the resulting shares (R2). It leaves behind a funded demo account the live demo
 * (U3) can fall back to.
 *
 *   pnpm -C backend demo:seed            # 100 USDC into the USD bucket
 *   pnpm -C backend demo:seed 250        # 250 USDC
 *   pnpm -C backend demo:seed 50 --currency EUR
 *
 * Secret hygiene (R8): `DEMO_DEPOSITOR_SECRET` and `FAUCET_ISSUER_SECRET` are backend-only. They are
 * read from the gitignored `backend/.env`, handed only to a signer / the existing faucet minter, and
 * **never printed** — the script logs the public `G…` and transaction hashes, nothing else. A generated
 * key is appended to `backend/.env` (gitignored), never to a commit.
 *
 * Shape: pure step helpers (`parseArgs`, `resolveSeedConfig`, `planSteps`) with a thin, fully injected
 * orchestrator (`runSeed`) over them — so the decision logic is tested offline (`demo-seed.test.ts`)
 * and only `main` reaches the network. Patterns follow `http/faucet-minter.ts` (simulate → assemble →
 * sign → submit → poll, and its `no-trustline` classification, which this script reuses rather than
 * re-implements) and `keeper/cli.ts` (thin argv entry over a module core).
 */

import { appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  Asset,
  BASE_FEE,
  Horizon,
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
} from '@stellar/stellar-sdk';
import type { Address, Amount, PreparedTx, Signer, VaultClient } from '@sorosense/vault-client';
import { SHARE_PRICE_SCALE } from '@sorosense/vault-client';

import { makeFaucetMinter } from '../http/faucet-minter.js';
import { createDepositorVaultClient } from '../tools/vault.js';

// ── Constants ───────────────────────────────────────────────────────────────

/** Base units per whole unit — Stellar's 7 decimals, shared by the classic asset and its SAC. */
export const UNIT = 10_000_000n;

/** Default deposit: 100 whole units (comfortably above the vault's `min_first_deposit`). */
const DEFAULT_AMOUNT = '100';

/** The only network this script will run against. A mainnet passphrase is a hard stop (R8). */
const TESTNET_PASSPHRASE: string = Networks.TESTNET;

const FRIENDBOT_URL = 'https://friendbot.stellar.org';
const EXPLORER_TX = 'https://stellar.expert/explorer/testnet/tx/';

/** The currencies the faucet can mint (A3 — MXN is internal-only and is never funded). */
export type SeedCurrency = 'USD' | 'EUR';

/** The classic asset code behind each currency's self-issued testnet SAC (STE-46). */
const ASSET_CODE: Record<SeedCurrency, string> = { USD: 'USDC', EUR: 'EURC' };

/** Env var holding each currency's SAC contract id — the same vars `POST /faucet` mints through. */
const SAC_VAR: Record<SeedCurrency, string> = { USD: 'USDC_SAC', EUR: 'EURC_SAC' };

/** Env var holding each currency's classic issuer, needed for the `changeTrust` the SAC mint requires. */
const ISSUER_VAR: Record<SeedCurrency, string> = { USD: 'USDC_ISSUER', EUR: 'EURC_ISSUER' };

/** The self-issued testnet USDC issuer (STE-46). Overridable via `USDC_ISSUER`. */
const DEFAULT_USDC_ISSUER = 'GDOWW3KRITEDQPL6UHB2NKT35UXY2HKXVYGWI47XZROI2KLBBTEWUL3T';

/** `backend/.env` — gitignored. Where a generated depositor secret is appended. */
const ENV_PATH = fileURLToPath(new URL('../../.env', import.meta.url));

// ── Pure helpers ────────────────────────────────────────────────────────────

/** A testnet explorer link for a transaction hash — the evidence a reviewer clicks (R2). */
export function explorerLink(hash: string): string {
  return `${EXPLORER_TX}${hash}`;
}

/**
 * Decode a decimal string (`"100"`, `"12.5"`, a Horizon balance like `"1000.0000000"`) into 7-decimal
 * base units: `100` → `1_000_000_000n`. String-based, so no float drift. Zero is a valid balance.
 */
export function toBaseUnits(decimal: string): Amount {
  const text = decimal.trim();
  if (!/^\d+(\.\d{1,7})?$/.test(text)) {
    throw new Error(`invalid amount: ${decimal} (expected a decimal with up to 7 places, e.g. 12.5)`);
  }
  const [whole = '0', fraction = ''] = text.split('.');
  return BigInt(whole) * UNIT + BigInt(fraction.padEnd(7, '0'));
}

/**
 * Parse the deposit amount. Rejects zero and negatives **before** anything is signed — the contract
 * would panic with `NonPositiveAmount`, and a script that discovers that on-chain has already burned a
 * fee and the operator's attention.
 */
export function parseAmount(raw: string = DEFAULT_AMOUNT): Amount {
  const base = toBaseUnits(raw);
  if (base <= 0n) throw new Error(`invalid amount: ${raw} (must be greater than zero)`);
  return base;
}

/** Format base units back to a readable decimal — display only, never fed back into a transaction. */
export function formatUnits(base: Amount): string {
  const whole = base / UNIT;
  const fraction = (base % UNIT).toString().padStart(7, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : `${whole}`;
}

export interface SeedArgs {
  amount: Amount;
  currency: SeedCurrency;
}

/**
 * Parse the CLI: a positional whole-unit amount plus an optional `--currency`. Defaults to
 * 100 USD — the demo deposit.
 */
export function parseArgs(argv: readonly string[]): SeedArgs {
  let rawAmount: string | undefined;
  let rawCurrency = 'USD';

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === undefined) continue;
    if (arg === '--') continue; // `pnpm run demo:seed -- 250` forwards the separator verbatim
    const [flag, inline] = arg.startsWith('--') ? splitFlag(arg) : [undefined, undefined];
    if (flag === 'currency' || flag === 'amount') {
      const value = inline ?? argv[++i];
      if (value === undefined) throw new Error(`--${flag} needs a value`);
      if (flag === 'currency') rawCurrency = value;
      else rawAmount = value;
    } else if (flag !== undefined) {
      throw new Error(`unknown flag: --${flag} (usage: demo:seed [amount] [--currency USD|EUR])`);
    } else {
      rawAmount = arg;
    }
  }

  const currency = rawCurrency.toUpperCase();
  if (currency !== 'USD' && currency !== 'EUR') {
    throw new Error(`unsupported currency: ${rawCurrency} (the faucet mints USD or EUR only)`);
  }
  return { amount: parseAmount(rawAmount), currency };
}

function splitFlag(arg: string): [string, string | undefined] {
  const body = arg.slice(2);
  const eq = body.indexOf('=');
  return eq === -1 ? [body, undefined] : [body.slice(0, eq), body.slice(eq + 1)];
}

/** Everything the run needs, resolved from env once and validated before any network call. */
export interface SeedConfig {
  contractId: string;
  rpcUrl: string;
  horizonUrl: string;
  networkPassphrase: string;
  /** Backend-only (R8): reaches the faucet minter and nothing else. Never logged, never returned. */
  faucetIssuerSecret: string;
  currency: SeedCurrency;
  /** Classic asset code (`USDC` / `EURC`) — the `changeTrust` the SAC mint requires. */
  assetCode: string;
  /** Classic asset issuer (`G…`) — the SAC wraps this asset. */
  assetIssuer: string;
  /** The SAC contract id (`C…`) the faucet mints through. */
  sac: string;
}

function require_(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (!value) {
    throw new Error(`missing ${name} — set it in backend/.env (see backend/.env.example)`);
  }
  return value;
}

/**
 * Resolve + validate the run's config from env. Fails fast with a named, actionable error — a missing
 * `VAULT_CONTRACT_ID` or `FAUCET_ISSUER_SECRET` must never produce a half-run that funds an account and
 * then dies. Refuses any network but testnet.
 */
export function resolveSeedConfig(env: NodeJS.ProcessEnv, currency: SeedCurrency): SeedConfig {
  const networkPassphrase = require_(env, 'STELLAR_NETWORK_PASSPHRASE');
  if (networkPassphrase !== TESTNET_PASSPHRASE) {
    throw new Error(
      `refusing to run: STELLAR_NETWORK_PASSPHRASE is not testnet — the demo seed script funds ` +
        `accounts from friendbot and mints test assets, and must never touch mainnet`,
    );
  }

  const assetCode = ASSET_CODE[currency];
  const assetIssuer =
    env[ISSUER_VAR[currency]] ?? (currency === 'USD' ? DEFAULT_USDC_ISSUER : undefined);
  if (!assetIssuer) {
    throw new Error(
      `missing ${ISSUER_VAR[currency]} — the ${assetCode} issuer is needed to sign the changeTrust ` +
        `before the SAC mint (see backend/.env.example)`,
    );
  }

  const sac = require_(env, SAC_VAR[currency]);
  // The SAC is a deterministic function of the classic asset, so a mismatch means the trustline we are
  // about to create is for a *different* asset than the one the faucet mints — the mint would fail
  // on-chain for a reason no log would explain. Catch it here instead.
  const derived = new Asset(assetCode, assetIssuer).contractId(networkPassphrase);
  if (derived !== sac) {
    throw new Error(
      `config mismatch: ${assetCode}:${assetIssuer} derives SAC ${derived}, but ` +
        `${SAC_VAR[currency]} is ${sac} — the trustline and the mint would target different assets ` +
        `(fix ${ISSUER_VAR[currency]} or ${SAC_VAR[currency]} in backend/.env)`,
    );
  }

  return {
    contractId: require_(env, 'VAULT_CONTRACT_ID'),
    rpcUrl: require_(env, 'STELLAR_RPC_URL'),
    horizonUrl: require_(env, 'STELLAR_HORIZON_URL'),
    networkPassphrase,
    faucetIssuerSecret: require_(env, 'FAUCET_ISSUER_SECRET'),
    currency,
    assetCode,
    assetIssuer,
    sac,
  };
}

/**
 * A step the run may take. The order of this list **is** the order of the journey — `consent` before
 * `deposit` is not a preference: the contract panics with `NoConsent` otherwise
 * (`smart-contract/contracts/vault/src/lib.rs:87-89`).
 */
export const SEED_STEPS = [
  'generate-key',
  'fund',
  'trustline',
  'mint',
  'consent',
  'deposit',
] as const;
export type SeedStep = (typeof SEED_STEPS)[number];

/** What the chain (and the env) already says about the demo depositor, before this run acts. */
export interface SeedState {
  /** `DEMO_DEPOSITOR_SECRET` was already in env — a fresh key means every later step is needed. */
  hasSecret: boolean;
  /** The account exists on Horizon (friendbot has funded it). */
  funded: boolean;
  /** The account trusts the currency's classic asset — without it, the SAC mint cannot land. */
  hasTrustline: boolean;
  /** The account's balance of that asset, in base units. */
  assetBalance: Amount;
  /** The depositor has signed the one-time safety mandate. */
  hasConsent: boolean;
}

/**
 * The idempotent step planner (R1) — the whole point of the script. Each step is planned only if the
 * chain says it is still needed, so a second run costs one deposit and nothing else. `generate-key` is
 * reported when the key was created on this run: it has necessarily already happened by the time a plan
 * exists (the chain reads need the public key), and it is in the plan so the printed evidence says so.
 *
 * `deposit` is always planned — the script's job is to put a deposit on-chain; it is the one step a
 * re-run repeats on purpose.
 */
export function planSteps(state: SeedState, amount: Amount): SeedStep[] {
  const steps: SeedStep[] = [];
  if (!state.hasSecret) steps.push('generate-key');
  if (!state.funded) steps.push('fund');
  if (!state.hasTrustline) steps.push('trustline');
  if (state.assetBalance < amount) steps.push('mint');
  if (!state.hasConsent) steps.push('consent');
  steps.push('deposit');
  return steps;
}

// ── The depositor key ───────────────────────────────────────────────────────

/** Side-effects the key resolution needs, injected so the tests never touch the filesystem. */
export interface KeyIo {
  /** Append a line to `backend/.env` (gitignored). Receives the secret — nothing else may. */
  appendEnv(line: string): void;
  log: (message: string) => void;
}

export interface DepositorKey {
  /** Backend-only. Handed to the signer and the `.env` append; never logged, never in a report. */
  secret: string;
  publicKey: Address;
  /** True when this run created the key (and therefore appended it to `backend/.env`). */
  generated: boolean;
}

/**
 * Read `DEMO_DEPOSITOR_SECRET`, or generate one and persist it to the gitignored `backend/.env` so the
 * next run reuses the same account — that is what makes the script idempotent rather than a wallet
 * factory. Only the public `G…` is ever logged (R8).
 */
export function resolveDepositorKey(env: NodeJS.ProcessEnv, io: KeyIo): DepositorKey {
  const existing = env.DEMO_DEPOSITOR_SECRET;
  if (existing) {
    let keypair: Keypair;
    try {
      keypair = Keypair.fromSecret(existing);
    } catch {
      // Deliberately does not echo the value — an invalid secret is still a secret.
      throw new Error('DEMO_DEPOSITOR_SECRET is not a valid Stellar secret key (expected S…)');
    }
    io.log(`demo depositor: ${keypair.publicKey()} (reused from DEMO_DEPOSITOR_SECRET)`);
    return { secret: existing, publicKey: keypair.publicKey(), generated: false };
  }

  const keypair = Keypair.random();
  io.appendEnv(`DEMO_DEPOSITOR_SECRET=${keypair.secret()}`);
  io.log(`demo depositor: ${keypair.publicKey()} (generated — secret appended to backend/.env)`);
  return { secret: keypair.secret(), publicKey: keypair.publicKey(), generated: true };
}

// ── Chain effects ───────────────────────────────────────────────────────────

/**
 * The chain effects the run needs, as one injectable port. The real implementation
 * ({@link makeStellarChain}) talks to Horizon (classic: account, trustline) and reuses the existing
 * faucet minter for the SAC mint (A2) — so the script and the UI's "Get test funds" button exercise the
 * same mint path. Tests inject a fake and stay offline.
 */
export interface SeedChain {
  /** Does the account exist on-chain (i.e. has friendbot funded it)? */
  isFunded(address: Address): Promise<boolean>;
  /** Fund via friendbot and wait for the account to exist. */
  fund(address: Address): Promise<void>;
  /** Does the account trust the currency's classic asset? */
  hasTrustline(address: Address): Promise<boolean>;
  /** Sign + submit `changeTrust` for that asset with the depositor's key. Returns the tx hash. */
  addTrustline(): Promise<string>;
  /** The account's balance of that asset, in base units (0 when there is no trustline). */
  assetBalance(address: Address): Promise<Amount>;
  /** Mint `amount` of the SAC to the address, signed by the issuer. Returns the tx hash. */
  mint(address: Address, amount: Amount): Promise<string>;
}

/** True for a Horizon 404 — the account does not exist yet (not funded). */
function isNotFound(error: unknown): boolean {
  const response = (error as { response?: { status?: number } } | null)?.response;
  return response?.status === 404;
}

/** The live chain effects: Horizon for the classic steps, the existing faucet minter for the SAC mint. */
export function makeStellarChain(config: SeedConfig, secret: string): SeedChain {
  const keypair = Keypair.fromSecret(secret);
  const horizon = new Horizon.Server(config.horizonUrl);
  const asset = new Asset(config.assetCode, config.assetIssuer);
  const minter = makeFaucetMinter({
    issuerSecret: config.faucetIssuerSecret,
    rpcUrl: config.rpcUrl,
    networkPassphrase: config.networkPassphrase,
  });

  /** Load the account, or `null` when Horizon says it does not exist. */
  async function load(address: Address): Promise<Horizon.AccountResponse | null> {
    try {
      return await horizon.loadAccount(address);
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  function trustline(account: Horizon.AccountResponse) {
    return account.balances.find(
      (b) =>
        b.asset_type !== 'native' &&
        b.asset_type !== 'liquidity_pool_shares' &&
        b.asset_code === config.assetCode &&
        b.asset_issuer === config.assetIssuer,
    );
  }

  return {
    async isFunded(address) {
      return (await load(address)) !== null;
    },

    async fund(address) {
      const response = await fetch(`${FRIENDBOT_URL}?addr=${encodeURIComponent(address)}`);
      if (!response.ok && response.status !== 400) {
        // 400 = "account already exists"; anything else is a real friendbot failure.
        throw new Error(`friendbot funding failed for ${address}: HTTP ${response.status}`);
      }
      for (let i = 0; i < 15; i++) {
        if (await this.isFunded(address)) return;
        await new Promise((r) => setTimeout(r, 1000));
      }
      throw new Error(`friendbot funded ${address} but the account never appeared on Horizon`);
    },

    async hasTrustline(address) {
      const account = await load(address);
      return account ? trustline(account) !== undefined : false;
    },

    async addTrustline() {
      const account = await horizon.loadAccount(keypair.publicKey());
      const tx = new TransactionBuilder(account, {
        fee: BASE_FEE,
        networkPassphrase: config.networkPassphrase,
      })
        .addOperation(Operation.changeTrust({ asset }))
        .setTimeout(60)
        .build();
      tx.sign(keypair);
      const submitted = await horizon.submitTransaction(tx);
      return submitted.hash;
    },

    async assetBalance(address) {
      const account = await load(address);
      if (!account) return 0n;
      const line = trustline(account);
      return line ? toBaseUnits(line.balance) : 0n;
    },

    async mint(address, amount) {
      const result = await minter.mint(config.sac, address, amount);
      if (!result.ok) {
        throw new Error(
          `mint refused: ${address} has no ${config.assetCode} trustline (the trustline step must run first)`,
        );
      }
      return result.hash;
    },
  };
}

// ── The run ─────────────────────────────────────────────────────────────────

/** What a completed run proves (R2). Carries public evidence only — never a secret. */
export interface SeedReport {
  publicKey: Address;
  currency: SeedCurrency;
  amount: Amount;
  /** The steps this run actually took — a second run plans (and takes) fewer. */
  steps: SeedStep[];
  /** Transaction hash per step that submitted one. */
  hashes: Partial<Record<SeedStep, string>>;
  shares: bigint;
  value: Amount;
  sharePrice: bigint;
}

/** Everything {@link runSeed} touches, injected — so the orchestrator itself is testable offline. */
export interface SeedDeps {
  config: SeedConfig;
  amount: Amount;
  key: DepositorKey;
  chain: SeedChain;
  vault: VaultClient;
  /** The depositor signer — consent and deposit are the depositor's own writes, never the keeper's. */
  signer: Signer;
  log: (message: string) => void;
}

/**
 * Read what the chain already knows about the depositor. An unfunded account is not queried further:
 * with no account there can be no trustline, no balance and no consent (a consent write would itself
 * need the account to exist), and the vault reads simulate against the depositor as source account.
 */
async function readState(deps: SeedDeps): Promise<SeedState> {
  const { chain, vault, key } = deps;
  const funded = await chain.isFunded(key.publicKey);
  const hasTrustline = funded ? await chain.hasTrustline(key.publicKey) : false;
  const assetBalance = hasTrustline ? await chain.assetBalance(key.publicKey) : 0n;
  const hasConsent = funded ? await vault.hasConsent(key.publicKey) : false;
  return { hasSecret: !key.generated, funded, hasTrustline, assetBalance, hasConsent };
}

/** Submit a depositor-signed vault write and stop loudly if the chain refused it. */
async function submit(deps: SeedDeps, step: SeedStep, prepared: PreparedTx): Promise<string> {
  const result = await prepared.signAndSubmit(deps.signer);
  if (!result.success) {
    throw new Error(`${step} was rejected by the chain (tx ${result.hash}) — nothing was written`);
  }
  return result.hash;
}

/**
 * Drive the journey: plan from live state, execute only the planned steps, then read the deposit back
 * from the contract and assert it is real. Every failure is loud — a script that swallows a rejected
 * transaction would be worse than no script at all.
 */
export async function runSeed(deps: SeedDeps): Promise<SeedReport> {
  const { config, amount, key, chain, vault, log } = deps;
  const asset = config.assetCode;

  const state = await readState(deps);
  const steps = planSteps(state, amount);
  const hashes: Partial<Record<SeedStep, string>> = {};

  log(
    `plan (${config.currency}, ${formatUnits(amount)} ${asset}): ${steps.join(' → ')}` +
      (steps.length === 1 ? '  [already seeded — deposit only]' : ''),
  );

  for (const step of steps) {
    switch (step) {
      case 'generate-key':
        // Already done: the key had to exist before any of the reads above could run.
        break;

      case 'fund':
        log('fund: requesting friendbot XLM…');
        await chain.fund(key.publicKey);
        log('fund: account funded');
        break;

      case 'trustline': {
        log(`trustline: signing changeTrust for ${asset}…`);
        hashes.trustline = await chain.addTrustline();
        log(`trustline: ${explorerLink(hashes.trustline)}`);
        break;
      }

      case 'mint': {
        // The one place the issuer secret is used, and it never leaves the minter (A2 — the same path
        // POST /faucet takes). Top up to the deposit amount, not blindly.
        const missing = amount - state.assetBalance;
        log(`mint: minting ${formatUnits(missing)} ${asset} to the demo depositor…`);
        hashes.mint = await chain.mint(key.publicKey, missing);
        log(`mint: ${explorerLink(hashes.mint)}`);
        break;
      }

      case 'consent': {
        // Mandatory before a deposit — the contract panics with NoConsent otherwise.
        log('consent: signing the one-time safety mandate…');
        hashes.consent = await submit(deps, 'consent', vault.setPolicyConsent(key.publicKey));
        log(`consent: ${explorerLink(hashes.consent)}`);
        break;
      }

      case 'deposit': {
        const sharesBefore = await vault.balanceOf(key.publicKey, config.currency);
        const valueBefore = await vault.assetValueOf(key.publicKey, config.currency);

        log(`deposit: depositing ${formatUnits(amount)} ${asset} into the ${config.currency} bucket…`);
        hashes.deposit = await submit(
          deps,
          'deposit',
          vault.deposit(key.publicKey, config.currency, amount),
        );
        log(`deposit: ${explorerLink(hashes.deposit)}`);

        const shares = await vault.balanceOf(key.publicKey, config.currency);
        const value = await vault.assetValueOf(key.publicKey, config.currency);
        const sharePrice = await vault.sharePrice(config.currency);

        // The read-back is the proof (R2). This seed deposits but does not allocate, so the bucket has
        // no accruing pool position yet — share price is exactly the scale — and the deposit must land
        // as an exact value delta. Accrual is proven separately once the keeper allocates (U5); here,
        // asserting the value grew on its own would be false by construction and is deliberately absent.
        if (shares <= sharesBefore) {
          throw new Error(
            `deposit landed (tx ${hashes.deposit}) but shares did not increase: ${sharesBefore} → ${shares}`,
          );
        }
        if (value !== valueBefore + amount) {
          throw new Error(
            `deposit landed (tx ${hashes.deposit}) but the read-back value is ${value}, ` +
              `expected ${valueBefore + amount} (${valueBefore} + ${amount})`,
          );
        }

        log(`read-back: shares=${shares} value=${formatUnits(value)} ${asset}`);
        log(`read-back: sharePrice=${sharePrice} (base scale is ${SHARE_PRICE_SCALE} — no yield accrues on-chain yet)`);

        return {
          publicKey: key.publicKey,
          currency: config.currency,
          amount,
          steps,
          hashes,
          shares,
          value,
          sharePrice,
        };
      }
    }
  }

  // Unreachable: `deposit` is always planned and returns from inside the loop.
  throw new Error('seed plan contained no deposit step');
}

// ── Entrypoint ──────────────────────────────────────────────────────────────

export async function main(argv: readonly string[]): Promise<number> {
  const log = (message: string) => console.log(message);
  try {
    const { amount, currency } = parseArgs(argv);
    const config = resolveSeedConfig(process.env, currency);
    const key = resolveDepositorKey(process.env, {
      appendEnv: (line) => appendFileSync(ENV_PATH, `\n${line}\n`),
      log,
    });
    const { client, signer } = createDepositorVaultClient({
      secret: key.secret,
      contractId: config.contractId,
      rpcUrl: config.rpcUrl,
      networkPassphrase: config.networkPassphrase,
    });

    const report = await runSeed({
      config,
      amount,
      key,
      chain: makeStellarChain(config, key.secret),
      vault: client,
      signer,
      log,
    });

    log('');
    log(`✓ seeded ${formatUnits(report.value)} ${config.assetCode} for ${report.publicKey}`);
    for (const step of SEED_STEPS) {
      const hash = report.hashes[step];
      if (hash) log(`  ${step.padEnd(9)} ${explorerLink(hash)}`);
    }
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

// Entrypoint: run when invoked directly (not when imported by a test).
if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    });
}
