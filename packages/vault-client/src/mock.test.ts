import { describe, expect, it } from 'vitest';
import { MockVaultClient, mockSigner } from './mock';
import { SHARE_PRICE_SCALE } from './interface';

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

describe('MockVaultClient — NAV reads (sharePrice / assetValueOf)', () => {
  it('a fresh bucket has base share price and zero asset value', async () => {
    const v = new MockVaultClient();
    expect(await v.sharePrice('USD')).toBe(SHARE_PRICE_SCALE);
    expect(await v.assetValueOf('alice', 'USD')).toBe(0n);
  });

  it('with no yield, price stays at base and asset value equals the deposit (1:1)', async () => {
    const v = new MockVaultClient();
    await v.deposit('alice', 'USD', 1_000n).signAndSubmit(depositor);
    expect(await v.sharePrice('USD')).toBe(SHARE_PRICE_SCALE);
    expect(await v.assetValueOf('alice', 'USD')).toBe(1_000n);
  });

  it('simulateYield raises share price and asset value, bounded by the injected yield', async () => {
    const v = new MockVaultClient();
    await v.deposit('alice', 'USD', 1_000n).signAndSubmit(depositor);
    v.simulateYield('USD', 200n);

    expect(await v.sharePrice('USD')).toBeGreaterThan(SHARE_PRICE_SCALE);
    const value = await v.assetValueOf('alice', 'USD');
    expect(value).toBeGreaterThan(1_000n); // gained yield
    expect(value).toBeLessThanOrEqual(1_200n); // never more than principal + injected yield
  });

  it('yield on one bucket never touches another currency (buckets independent)', async () => {
    const v = new MockVaultClient();
    await v.deposit('alice', 'USD', 1_000n).signAndSubmit(depositor);
    await v.deposit('alice', 'EUR', 500n).signAndSubmit(depositor);
    v.simulateYield('USD', 300n);

    expect(await v.sharePrice('EUR')).toBe(SHARE_PRICE_SCALE);
    expect(await v.assetValueOf('alice', 'EUR')).toBe(500n);
  });

  it('a later depositor buys in at the current price without diluting the earlier holder', async () => {
    const v = new MockVaultClient();
    await v.deposit('alice', 'USD', 1_000n).signAndSubmit(depositor);
    v.simulateYield('USD', 200n);
    const aliceBefore = await v.assetValueOf('alice', 'USD');

    const bob = mockSigner('depositor', 'bob');
    await v.deposit('bob', 'USD', 1_200n).signAndSubmit(bob);

    // Alice's value is unchanged by Bob's deposit; Bob's value ~= what he put in.
    expect(await v.assetValueOf('alice', 'USD')).toBe(aliceBefore);
    const bobValue = await v.assetValueOf('bob', 'USD');
    expect(bobValue).toBeGreaterThan(1_190n);
    expect(bobValue).toBeLessThanOrEqual(1_200n);
  });

  it('rejects a negative simulateYield', () => {
    const v = new MockVaultClient();
    expect(() => v.simulateYield('USD', -1n)).toThrow(/non-negative/);
  });
});
