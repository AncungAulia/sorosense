import { describe, expect, it, vi } from 'vitest';
import { MockVaultClient, mockSigner, type Signer } from '@sorosense/vault-client';
import { freezePool } from './freeze.js';

const keeper = mockSigner('keeper', 'sentinel');

describe('freezePool', () => {
  it('submits exactly one freeze for an anomalous active pool and marks it frozen', async () => {
    const vault = new MockVaultClient();
    const freezeSpy = vi.spyOn(vault, 'freeze');

    const out = await freezePool('blend-usdc', { vault, keeper });

    expect(out.status).toBe('frozen');
    expect(freezeSpy).toHaveBeenCalledOnce();
    expect(await vault.poolStatus('blend-usdc')).toBe('frozen');
  });

  it('is a no-op when the pool is already frozen (idempotent)', async () => {
    const vault = new MockVaultClient();
    await vault.freeze('blend-usdc').signAndSubmit(keeper); // pre-frozen
    const freezeSpy = vi.spyOn(vault, 'freeze');

    const out = await freezePool('blend-usdc', { vault, keeper });

    expect(out.status).toBe('already-frozen');
    expect(freezeSpy).not.toHaveBeenCalled();
  });

  it('retries a transient submit failure, then alerts', async () => {
    const vault = new MockVaultClient();
    // A keeper whose signing always throws simulates a submit/RPC failure.
    const flakyKeeper: Signer = {
      role: 'keeper',
      address: 'sentinel',
      sign: vi.fn(async () => {
        throw new Error('RPC timeout');
      }),
    };
    const onAlert = vi.fn();

    const out = await freezePool('blend-usdc', { vault, keeper: flakyKeeper, maxRetries: 2, onAlert });

    expect(out.status).toBe('failed');
    expect(flakyKeeper.sign).toHaveBeenCalledTimes(3); // initial + 2 retries
    expect(onAlert).toHaveBeenCalledOnce();
  });

  it('never moves funds — no allocate/deallocate/withdraw is reachable from this path', async () => {
    const vault = new MockVaultClient();
    await vault.deposit('alice', 'USD', 1_000n).signAndSubmit(mockSigner('depositor', 'alice'));
    await vault.allocate('blend-usdc', 'USD', 1_000n).signAndSubmit(keeper);

    const allocateSpy = vi.spyOn(vault, 'allocate');
    const deallocateSpy = vi.spyOn(vault, 'deallocate');
    const withdrawSpy = vi.spyOn(vault, 'withdraw');

    await freezePool('blend-usdc', { vault, keeper });

    expect(allocateSpy).not.toHaveBeenCalled();
    expect(deallocateSpy).not.toHaveBeenCalled();
    expect(withdrawSpy).not.toHaveBeenCalled();
    // Balance untouched by the protective freeze.
    expect(await vault.balanceOf('alice', 'USD')).toBe(1_000n);
  });

  it('refuses to act with a non-keeper signer', async () => {
    const vault = new MockVaultClient();
    const out = await freezePool('blend-usdc', { vault, keeper: mockSigner('depositor', 'alice') });
    expect(out.status).toBe('failed');
  });
});
