/**
 * Offline tests for the demo seed script (U1). The *network* run is the real proof (see the plan's
 * Verification), so these cover exactly the decision logic that would otherwise only be exercised by
 * burning testnet state: the idempotent step planner, fail-fast config validation, amount parsing, and
 * secret hygiene. No test here touches Horizon, RPC or friendbot — every effect is injected.
 *
 * The vault is a real {@link MockVaultClient} (never a stub of our own seam); only the chain effects
 * and the signer are fakes.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Asset, Keypair, Networks } from '@stellar/stellar-sdk';
import { MockVaultClient, type PreparedTx, type Signer } from '@sorosense/vault-client';

import {
  UNIT,
  formatUnits,
  parseAmount,
  parseArgs,
  planSteps,
  resolveDepositorKey,
  resolveSeedConfig,
  runSeed,
  toBaseUnits,
  type SeedChain,
  type SeedState,
} from '../demo-seed.js';

/** The self-issued testnet USDC issuer (public — the SAC is derived from it below). */
const USDC_ISSUER = 'GDOWW3KRITEDQPL6UHB2NKT35UXY2HKXVYGWI47XZROI2KLBBTEWUL3T';
const USDC_SAC = new Asset('USDC', USDC_ISSUER).contractId(Networks.TESTNET);
const MAINNET_PASSPHRASE = Networks.PUBLIC;

/** A complete, valid testnet env. Cases below delete or override one var at a time. */
function testEnv(): NodeJS.ProcessEnv {
  return {
    VAULT_CONTRACT_ID: 'CCK5G4FQ53Y7TIQY6CZLOSLCF5DKL44XV2LNFKCMHTSCWNWEAI3D457Y',
    STELLAR_RPC_URL: 'https://soroban-testnet.stellar.org',
    STELLAR_HORIZON_URL: 'https://horizon-testnet.stellar.org',
    STELLAR_NETWORK_PASSPHRASE: Networks.TESTNET,
    FAUCET_ISSUER_SECRET: Keypair.random().secret(), // throwaway — never a real key in tests
    USDC_SAC,
    USDC_ISSUER,
  };
}

const AMOUNT = 100n * UNIT; // 100 USDC

describe('parseAmount / toBaseUnits', () => {
  it('parses whole units into 7-decimal base units', () => {
    expect(parseAmount('100')).toBe(1_000_000_000n);
    expect(parseAmount('12.5')).toBe(125_000_000n);
    expect(parseAmount()).toBe(1_000_000_000n); // the default demo deposit
  });

  it('rejects a zero or negative amount before anything is signed (the contract panics NonPositiveAmount)', () => {
    expect(() => parseAmount('0')).toThrow(/greater than zero/);
    expect(() => parseAmount('0.0000000')).toThrow(/greater than zero/);
    expect(() => parseAmount('-5')).toThrow(/invalid amount/);
    expect(() => parseAmount('abc')).toThrow(/invalid amount/);
  });

  it('decodes a Horizon balance string, where zero is legitimate', () => {
    expect(toBaseUnits('0.0000000')).toBe(0n);
    expect(toBaseUnits('1000.0000000')).toBe(10_000_000_000n);
  });

  it('formats base units back for display', () => {
    expect(formatUnits(1_000_000_000n)).toBe('100');
    expect(formatUnits(125_000_000n)).toBe('12.5');
  });
});

describe('parseArgs', () => {
  it('defaults to 100 USD', () => {
    expect(parseArgs([])).toEqual({ amount: 1_000_000_000n, currency: 'USD' });
  });

  it('takes a positional amount and an optional currency', () => {
    expect(parseArgs(['250'])).toEqual({ amount: 2_500_000_000n, currency: 'USD' });
    expect(parseArgs(['50', '--currency', 'EUR'])).toEqual({ amount: 500_000_000n, currency: 'EUR' });
    expect(parseArgs(['--amount=75', '--currency=eur'])).toEqual({
      amount: 750_000_000n,
      currency: 'EUR',
    });
  });

  it('refuses a currency the faucet cannot mint (MXN is never funded — A3)', () => {
    expect(() => parseArgs(['100', '--currency', 'MXN'])).toThrow(/unsupported currency/);
  });

  it('refuses an unknown flag rather than silently ignoring it', () => {
    expect(() => parseArgs(['--network', 'mainnet'])).toThrow(/unknown flag/);
  });

  it('ignores the `--` separator pnpm forwards verbatim (`pnpm demo:seed -- 250`)', () => {
    expect(parseArgs(['--', '250'])).toEqual({ amount: 2_500_000_000n, currency: 'USD' });
  });

  it('rejects a non-positive amount from the CLI, before a signer exists', () => {
    expect(() => parseArgs(['0'])).toThrow(/greater than zero/);
  });
});

describe('resolveSeedConfig — fails fast, before any network call', () => {
  it('resolves a complete testnet env', () => {
    const config = resolveSeedConfig(testEnv(), 'USD');
    expect(config.assetCode).toBe('USDC');
    expect(config.assetIssuer).toBe(USDC_ISSUER);
    expect(config.sac).toBe(USDC_SAC);
  });

  it('refuses a non-testnet passphrase (a mainnet run is a hard stop)', () => {
    const env = { ...testEnv(), STELLAR_NETWORK_PASSPHRASE: MAINNET_PASSPHRASE };
    expect(() => resolveSeedConfig(env, 'USD')).toThrow(/not testnet/);
  });

  it('names the missing var — never a half-run', () => {
    const noContract = testEnv();
    delete noContract.VAULT_CONTRACT_ID;
    expect(() => resolveSeedConfig(noContract, 'USD')).toThrow(/VAULT_CONTRACT_ID/);

    const noIssuerSecret = testEnv();
    delete noIssuerSecret.FAUCET_ISSUER_SECRET;
    expect(() => resolveSeedConfig(noIssuerSecret, 'USD')).toThrow(/FAUCET_ISSUER_SECRET/);

    const noSac = testEnv();
    delete noSac.USDC_SAC;
    expect(() => resolveSeedConfig(noSac, 'USD')).toThrow(/USDC_SAC/);

    const noEurIssuer = testEnv();
    expect(() => resolveSeedConfig(noEurIssuer, 'EUR')).toThrow(/EURC_ISSUER/);
  });

  it('catches a SAC that is not the one the asset derives (trustline and mint would target different assets)', () => {
    const env = { ...testEnv(), USDC_SAC: 'CBADSACADDRESSTHATDOESNOTMATCHTHEASSETXXXXXXXXXXXXXXXXXXX' };
    expect(() => resolveSeedConfig(env, 'USD')).toThrow(/config mismatch/);
  });
});

describe('planSteps — the idempotent step planner (R1)', () => {
  const fresh: SeedState = {
    hasSecret: false,
    funded: false,
    hasTrustline: false,
    assetBalance: 0n,
    hasConsent: false,
  };
  const seeded: SeedState = {
    hasSecret: true,
    funded: true,
    hasTrustline: true,
    assetBalance: AMOUNT,
    hasConsent: true,
  };

  it('plans all six steps in order for a brand-new key', () => {
    expect(planSteps(fresh, AMOUNT)).toEqual([
      'generate-key',
      'fund',
      'trustline',
      'mint',
      'consent',
      'deposit',
    ]);
  });

  it('plans consent strictly before deposit (a deposit without consent is the NoConsent panic)', () => {
    const steps = planSteps(fresh, AMOUNT);
    expect(steps.indexOf('consent')).toBeGreaterThan(-1);
    expect(steps.indexOf('consent')).toBeLessThan(steps.indexOf('deposit'));
  });

  it('plans ONLY the deposit for an account that is funded, trustlined, funded enough and consented', () => {
    expect(planSteps(seeded, AMOUNT)).toEqual(['deposit']);
  });

  it('skips generate-key when the secret is already in env', () => {
    expect(planSteps({ ...fresh, hasSecret: true }, AMOUNT)).not.toContain('generate-key');
  });

  it('mints only when the balance is short of the deposit', () => {
    expect(planSteps({ ...seeded, assetBalance: AMOUNT - 1n }, AMOUNT)).toContain('mint');
    expect(planSteps({ ...seeded, assetBalance: AMOUNT * 2n }, AMOUNT)).not.toContain('mint');
  });
});

describe('resolveDepositorKey — secret hygiene (R8)', () => {
  it('reuses the secret in env and logs only the public key', () => {
    const kp = Keypair.random();
    const lines: string[] = [];
    const appended: string[] = [];
    const key = resolveDepositorKey(
      { DEMO_DEPOSITOR_SECRET: kp.secret() },
      { appendEnv: (l) => appended.push(l), log: (m) => lines.push(m) },
    );

    expect(key).toMatchObject({ publicKey: kp.publicKey(), generated: false });
    expect(appended).toHaveLength(0); // an existing key is never re-appended
    expect(lines.join('\n')).toContain(kp.publicKey());
    expect(lines.join('\n')).not.toContain(kp.secret());
  });

  it('generates a key, appends it to the gitignored .env, and never logs it', () => {
    const lines: string[] = [];
    const appended: string[] = [];
    const key = resolveDepositorKey({}, { appendEnv: (l) => appended.push(l), log: (m) => lines.push(m) });

    expect(key.generated).toBe(true);
    expect(appended).toEqual([`DEMO_DEPOSITOR_SECRET=${key.secret}`]);
    expect(lines.join('\n')).toContain(key.publicKey);
    expect(lines.join('\n')).not.toContain(key.secret);
  });

  it('rejects an invalid secret without echoing it', () => {
    expect(() =>
      resolveDepositorKey({ DEMO_DEPOSITOR_SECRET: 'SNOTAREALSECRET' }, { appendEnv: () => {}, log: () => {} }),
    ).toThrow(/not a valid Stellar secret key/);
    expect(() =>
      resolveDepositorKey({ DEMO_DEPOSITOR_SECRET: 'SNOTAREALSECRET' }, { appendEnv: () => {}, log: () => {} }),
    ).not.toThrow(/SNOTAREALSECRET/);
  });
});

// ── runSeed — the orchestrator, with injected chain effects ──────────────────

/** A fake chain that records what the run actually did. Nothing here touches the network. */
function fakeChain(state: { funded: boolean; trustline: boolean; balance: bigint }) {
  const calls: string[] = [];
  const minted: bigint[] = [];
  const chain: SeedChain = {
    async isFunded() {
      calls.push('isFunded');
      return state.funded;
    },
    async fund() {
      calls.push('fund');
      state.funded = true;
    },
    async hasTrustline() {
      return state.trustline;
    },
    async addTrustline() {
      calls.push('addTrustline');
      state.trustline = true;
      return 'hash-trustline';
    },
    async assetBalance() {
      return state.balance;
    },
    async mint(_address, amount) {
      calls.push('mint');
      minted.push(amount);
      state.balance += amount;
      return 'hash-mint';
    },
  };
  return { chain, calls, minted };
}

/** A depositor signer that satisfies the seam's role check without decoding a real XDR envelope. */
function fakeSigner(address: string): Signer {
  return { role: 'depositor', address, sign: async (xdr) => xdr };
}

function seedDeps(overrides: {
  vault?: MockVaultClient;
  chain?: SeedChain;
  generated?: boolean;
  publicKey?: string;
  log?: (m: string) => void;
}) {
  const publicKey = overrides.publicKey ?? Keypair.random().publicKey();
  const vault = overrides.vault ?? new MockVaultClient();
  return {
    config: resolveSeedConfig(testEnv(), 'USD'),
    amount: AMOUNT,
    key: { secret: 'S-never-logged', publicKey, generated: overrides.generated ?? true },
    chain: overrides.chain ?? fakeChain({ funded: false, trustline: false, balance: 0n }).chain,
    vault,
    signer: fakeSigner(publicKey),
    log: overrides.log ?? (() => {}),
  };
}

describe('runSeed', () => {
  let logs: string[];
  beforeEach(() => {
    logs = [];
  });

  it('takes a fresh account through fund → trustline → mint → consent → deposit and reads the deposit back', async () => {
    const { chain, calls, minted } = fakeChain({ funded: false, trustline: false, balance: 0n });
    const vault = new MockVaultClient();
    const deps = seedDeps({ chain, vault, log: (m) => logs.push(m) });

    const report = await runSeed(deps);

    expect(calls).toEqual(['isFunded', 'fund', 'addTrustline', 'mint']);
    expect(minted).toEqual([AMOUNT]); // tops up exactly the deposit, no more
    expect(report.steps).toEqual(['generate-key', 'fund', 'trustline', 'mint', 'consent', 'deposit']);
    expect(report.hashes.deposit).toBeTruthy();
    expect(report.hashes.consent).toBeTruthy();

    // The read-back is the proof: shares minted, and value equals the deposit (share price is the base
    // scale — no yield accrues on-chain yet, so asserting growth would be false by construction).
    expect(report.shares).toBeGreaterThan(0n);
    expect(report.value).toBe(AMOUNT);
    expect(await vault.hasConsent(deps.key.publicKey)).toBe(true);
  });

  it('is idempotent: a seeded account plans and takes only the deposit', async () => {
    const publicKey = Keypair.random().publicKey();
    const vault = new MockVaultClient();
    await vault.setPolicyConsent(publicKey).signAndSubmit(fakeSigner(publicKey));

    const { chain, calls } = fakeChain({ funded: true, trustline: true, balance: AMOUNT });
    const report = await runSeed(seedDeps({ chain, vault, publicKey, generated: false }));

    expect(report.steps).toEqual(['deposit']);
    expect(calls).toEqual(['isFunded']); // no friendbot, no changeTrust, no mint
    expect(report.shares).toBeGreaterThan(0n);
  });

  it('asserts the value delta on a re-deposit, not a first-deposit equality', async () => {
    const publicKey = Keypair.random().publicKey();
    const vault = new MockVaultClient();
    await vault.setPolicyConsent(publicKey).signAndSubmit(fakeSigner(publicKey));
    await vault.deposit(publicKey, 'USD', AMOUNT).signAndSubmit(fakeSigner(publicKey));

    const { chain } = fakeChain({ funded: true, trustline: true, balance: AMOUNT });
    const report = await runSeed(seedDeps({ chain, vault, publicKey, generated: false }));

    expect(report.value).toBe(AMOUNT * 2n); // the run's own deposit landed on top of the existing one
  });

  it('stops loudly when the chain rejects the deposit (a submitted tx is not a successful one)', async () => {
    const publicKey = Keypair.random().publicKey();
    const vault = new MockVaultClient();
    await vault.setPolicyConsent(publicKey).signAndSubmit(fakeSigner(publicKey));
    // RealVaultClient resolves { success: false } without throwing — the case the mock cannot produce.
    const rejecting: PreparedTx = {
      xdr: 'x',
      requiredSigner: 'depositor',
      signAndSubmit: async () => ({ hash: 'hash-rejected', success: false }),
    };
    vi.spyOn(vault, 'deposit').mockReturnValue(rejecting);

    const { chain } = fakeChain({ funded: true, trustline: true, balance: AMOUNT });
    await expect(runSeed(seedDeps({ chain, vault, publicKey, generated: false }))).rejects.toThrow(
      /deposit was rejected by the chain \(tx hash-rejected\)/,
    );
  });

  it('stops loudly when consent is rejected, and never attempts the deposit (the NoConsent panic)', async () => {
    const publicKey = Keypair.random().publicKey();
    const vault = new MockVaultClient();
    const rejecting: PreparedTx = {
      xdr: 'x',
      requiredSigner: 'depositor',
      signAndSubmit: async () => ({ hash: 'hash-rejected', success: false }),
    };
    vi.spyOn(vault, 'setPolicyConsent').mockReturnValue(rejecting);
    const deposit = vi.spyOn(vault, 'deposit');

    const { chain } = fakeChain({ funded: true, trustline: true, balance: AMOUNT });
    await expect(runSeed(seedDeps({ chain, vault, publicKey, generated: false }))).rejects.toThrow(
      /consent was rejected by the chain/,
    );
    expect(deposit).not.toHaveBeenCalled();
  });

  it('logs the public key and the tx hashes — never the secret (R8)', async () => {
    const publicKey = Keypair.random().publicKey();
    const secret = Keypair.random().secret();
    const { chain } = fakeChain({ funded: false, trustline: false, balance: 0n });
    const deps = { ...seedDeps({ chain, publicKey, log: (m: string) => logs.push(m) }), key: { secret, publicKey, generated: true } };

    const report = await runSeed({ ...deps, signer: fakeSigner(publicKey) });
    const printed = logs.join('\n');

    expect(printed).toContain(report.hashes.deposit as string);
    expect(printed).not.toContain(secret);
    expect(printed).not.toMatch(/\bS[A-Z2-7]{55}\b/); // no Stellar secret in any shape
  });
});
