import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Keypair } from '@stellar/stellar-sdk';
import { MockVaultClient, RealVaultClient } from '@sorosense/vault-client';
import { getVaultClient, __resetVaultClient } from './vault.js';
import { makeKeeperSigner } from './keeper-signer.js';

const INTEGRATION_VARS = [
  'VAULT_CONTRACT_ID',
  'STELLAR_RPC_URL',
  'STELLAR_NETWORK_PASSPHRASE',
  'KEEPER_SECRET',
] as const;

const PASSPHRASE = 'Test SDF Network ; September 2015';

describe('getVaultClient — config-driven selection', () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of INTEGRATION_VARS) saved[k] = process.env[k];
    // Start each case from a clean, mock-default env regardless of the ambient .env.
    for (const k of INTEGRATION_VARS) delete process.env[k];
    __resetVaultClient();
  });

  afterEach(() => {
    for (const k of INTEGRATION_VARS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    __resetVaultClient();
  });

  it('returns the mock when integration env is unset (the default — keeps CI green offline)', () => {
    expect(getVaultClient()).toBeInstanceOf(MockVaultClient);
  });

  it('returns the real client when every integration var is present', () => {
    process.env.VAULT_CONTRACT_ID = 'CCK5G4FQ53Y7TIQY6CZLOSLCF5DKL44XV2LNFKCMHTSCWNWEAI3D457Y';
    process.env.STELLAR_RPC_URL = 'https://soroban-testnet.stellar.org';
    process.env.STELLAR_NETWORK_PASSPHRASE = PASSPHRASE;
    process.env.KEEPER_SECRET = Keypair.random().secret(); // throwaway; never a real key in tests
    __resetVaultClient();
    expect(getVaultClient()).toBeInstanceOf(RealVaultClient);
  });

  it('falls back to the mock when KEEPER_SECRET is missing (partial env never half-boots)', () => {
    process.env.VAULT_CONTRACT_ID = 'CCK5G4FQ53Y7TIQY6CZLOSLCF5DKL44XV2LNFKCMHTSCWNWEAI3D457Y';
    process.env.STELLAR_RPC_URL = 'https://soroban-testnet.stellar.org';
    process.env.STELLAR_NETWORK_PASSPHRASE = PASSPHRASE;
    __resetVaultClient();
    expect(getVaultClient()).toBeInstanceOf(MockVaultClient);
  });

  it('is a stable singleton within one selection', () => {
    expect(getVaultClient()).toBe(getVaultClient());
  });
});

describe('makeKeeperSigner', () => {
  it('derives a keeper-role signer whose address matches the secret', () => {
    const kp = Keypair.random();
    const signer = makeKeeperSigner(kp.secret(), PASSPHRASE);
    expect(signer.role).toBe('keeper');
    expect(signer.address).toBe(kp.publicKey());
    expect(typeof signer.sign).toBe('function');
  });
});
