import { describe, expect, it } from 'vitest';
import { MockVaultClient, mockSigner } from './mock.js';

const depositor = mockSigner('depositor', 'alice');
const keeper = mockSigner('keeper', 'sentinel');

describe('MockVaultClient', () => {
  it('deposit then balanceOf returns correct per-currency shares', async () => {
    const v = new MockVaultClient();
    await v.deposit('alice', 'USD', 1_000n).signAndSubmit(depositor);
    await v.deposit('alice', 'EUR', 250n).signAndSubmit(depositor);

    expect(await v.balanceOf('alice', 'USD')).toBe(1_000n);
    expect(await v.balanceOf('alice', 'EUR')).toBe(250n);
    // Buckets are independent — a USD deposit never touches the MXN bucket.
    expect(await v.balanceOf('alice', 'MXN')).toBe(0n);
  });

  it('withdraw burns shares and rejects over-withdrawal', async () => {
    const v = new MockVaultClient();
    await v.deposit('alice', 'USD', 1_000n).signAndSubmit(depositor);
    await v.withdraw('alice', 'USD', 400n).signAndSubmit(depositor);
    expect(await v.balanceOf('alice', 'USD')).toBe(600n);

    await expect(v.withdraw('alice', 'USD', 999n).signAndSubmit(depositor)).rejects.toThrow(
      /exceeds owned/,
    );
  });

  it('freeze(pool) flips poolStatus to frozen and blocks allocate into it', async () => {
    const v = new MockVaultClient();
    expect(await v.poolStatus('blend-usdc')).toBe('active');

    await v.freeze('blend-usdc').signAndSubmit(keeper);
    expect(await v.poolStatus('blend-usdc')).toBe('frozen');

    await expect(v.allocate('blend-usdc', 'USD', 500n).signAndSubmit(keeper)).rejects.toThrow(
      /frozen/,
    );
  });

  it('freeze moves no funds — a held bucket keeps its balance', async () => {
    const v = new MockVaultClient();
    await v.deposit('alice', 'USD', 1_000n).signAndSubmit(depositor);
    await v.allocate('blend-usdc', 'USD', 1_000n).signAndSubmit(keeper);

    await v.freeze('blend-usdc').signAndSubmit(keeper);

    // Balance is untouched by the protective freeze.
    expect(await v.balanceOf('alice', 'USD')).toBe(1_000n);
    expect(await v.activePool('USD')).toBe('blend-usdc');
  });

  it('setPolicyConsent is idempotent (no tier argument)', async () => {
    const v = new MockVaultClient();
    expect(await v.hasConsent('alice')).toBe(false);

    await v.setPolicyConsent('alice').signAndSubmit(depositor);
    await v.setPolicyConsent('alice').signAndSubmit(depositor); // second time is a no-op

    expect(await v.hasConsent('alice')).toBe(true);
  });

  it('freeze-exit flow: keeper proposes, depositor approves, active pool moves', async () => {
    const v = new MockVaultClient();
    await v.deposit('alice', 'USD', 1_000n).signAndSubmit(depositor);
    await v.allocate('blend-usdc', 'USD', 1_000n).signAndSubmit(keeper);
    await v.freeze('blend-usdc').signAndSubmit(keeper);

    await v.proposeExit('USD', 'blend-usdc', 'defindex-usdc').signAndSubmit(keeper);
    const pending = await v.pendingExit('USD');
    expect(pending?.toPool).toBe('defindex-usdc');

    await v.approveExit('alice', pending!.id).signAndSubmit(depositor);
    expect(await v.activePool('USD')).toBe('defindex-usdc');
    expect(await v.pendingExit('USD')).toBeNull();
  });

  it('rejects a transaction signed by the wrong role', async () => {
    const v = new MockVaultClient();
    // A depositor cannot sign a keeper-only freeze.
    await expect(v.freeze('blend-usdc').signAndSubmit(depositor)).rejects.toThrow(/wrong signer/);
    // The keeper cannot sign a depositor deposit.
    await expect(v.deposit('alice', 'USD', 10n).signAndSubmit(keeper)).rejects.toThrow(
      /wrong signer/,
    );
  });
});
