/**
 * Keeper runner integration test (STE-21 Fase D / U2) — object-real with a spy vault + mock effects,
 * no network. Asserts: (1) `freezePool` drives the keeper `freeze` write on the currency's demo pool,
 * keeper-signed, and a wrong-role signer is rejected; (2) `runTick` routes a rebalance decision to the
 * rebalance effect, matching the pure `classifyBucket`; (3) in mock mode the real-write actions refuse
 * with a clear message and attempt no write.
 */

import { describe, expect, it, vi } from 'vitest';
import { MockVaultClient, mockSigner } from '@sorosense/vault-client';
import type { AllocatorEffects, Candidate } from '../mastra/allocator.js';
import { InMemoryBucketStore } from '../mastra/allocator.js';
import { MOCK_MODE_MESSAGE, makeKeeperRunner } from './runner.js';

/** Integration env just needs to be non-empty for the live guard; the client is injected directly. */
const LIVE_ENV: NodeJS.ProcessEnv = {
  VAULT_CONTRACT_ID: 'C_TEST',
  STELLAR_RPC_URL: 'https://rpc.test',
  STELLAR_NETWORK_PASSPHRASE: 'Test SDF Network ; September 2015',
  KEEPER_SECRET: 'S_TEST',
};

/** Spy effects standing in for the runner's real (keeper-signing) effects. */
function spyEffects(): AllocatorEffects & {
  compound: ReturnType<typeof vi.fn>;
  rebalance: ReturnType<typeof vi.fn>;
  freezeExit: ReturnType<typeof vi.fn>;
} {
  return {
    compound: vi.fn(async () => {}),
    rebalance: vi.fn(async () => {}),
    freezeExit: vi.fn(async () => {}),
  };
}

describe('makeKeeperRunner — freezePool', () => {
  it('drives the keeper freeze write on the currency demo pool, keeper-signed', async () => {
    const client = new MockVaultClient();
    const freeze = vi.spyOn(client, 'freeze');
    const runner = makeKeeperRunner({
      client,
      signer: mockSigner('keeper'),
      integration: true,
      env: LIVE_ENV,
    });

    const res = await runner.freezePool('USD');

    expect(freeze).toHaveBeenCalledWith('sorosense-usd'); // the settled USD demo pool slug
    expect(res.success).toBe(true);
    expect(await client.poolStatus('sorosense-usd')).toBe('frozen');
  });

  it('rejects a wrong-role (depositor) signer, mirroring the seam guard', async () => {
    const client = new MockVaultClient();
    const runner = makeKeeperRunner({
      client,
      signer: mockSigner('depositor'),
      integration: true,
      env: LIVE_ENV,
    });

    await expect(runner.freezePool('USD')).rejects.toThrow(/wrong signer: need keeper/);
  });
});

describe('makeKeeperRunner — allocate', () => {
  it('moves idle bucket funds into the currency demo pool, keeper-signed', async () => {
    const client = new MockVaultClient();
    const allocate = vi.spyOn(client, 'allocate');
    const runner = makeKeeperRunner({
      client,
      signer: mockSigner('keeper'),
      integration: true,
      env: LIVE_ENV,
    });

    const res = await runner.allocate('USD', 100_000n);

    expect(allocate).toHaveBeenCalledWith('sorosense-usd', 'USD', 100_000n);
    expect(res.success).toBe(true);
  });

  it('refuses a real allocate in mock mode and attempts no write', async () => {
    const client = new MockVaultClient();
    const allocate = vi.spyOn(client, 'allocate');
    const runner = makeKeeperRunner({ client, integration: false, env: {} });

    await expect(runner.allocate('USD', 100_000n)).rejects.toThrow(MOCK_MODE_MESSAGE);
    expect(allocate).not.toHaveBeenCalled();
  });
});

describe('makeKeeperRunner — runTick', () => {
  it('routes a rebalance decision to the rebalance effect, matching classifyBucket', async () => {
    const effects = spyEffects();
    const store = new InMemoryBucketStore();
    store.setActivePool('USD', 'pool-a');
    // pool-b's risk-adjusted yield clears the active pool's by more than the threshold → rebalance.
    const candidates: Candidate[] = [
      { poolId: 'pool-a', ray: 5 },
      { poolId: 'pool-b', ray: 10 },
    ];
    const runner = makeKeeperRunner({ client: new MockVaultClient(), integration: true, env: LIVE_ENV });

    const decision = await runner.runTick('USD', {
      candidates,
      activeRay: 5,
      thresholdPct: 0.5,
      store,
      effects,
    });

    expect(decision).toEqual({ kind: 'rebalance', currency: 'USD', from: 'pool-a', to: 'pool-b' });
    expect(effects.rebalance).toHaveBeenCalledWith('USD', 'pool-a', 'pool-b');
    expect(effects.compound).not.toHaveBeenCalled();
    expect(effects.freezeExit).not.toHaveBeenCalled();
    expect(store.getActivePool('USD')).toBe('pool-b'); // store advanced for idempotency
  });
});

describe('makeKeeperRunner — mock-mode guard', () => {
  it('refuses a real freeze with a clear message and attempts no write', async () => {
    const client = new MockVaultClient();
    const freeze = vi.spyOn(client, 'freeze');
    // Integration env absent → mock mode.
    const runner = makeKeeperRunner({ client, integration: false, env: {} });

    await expect(runner.freezePool('USD')).rejects.toThrow(MOCK_MODE_MESSAGE);
    expect(freeze).not.toHaveBeenCalled();
  });
});
