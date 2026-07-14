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

describe('MockVaultClient — auto-compound preference', () => {
  it('defaults to enabled for an unset depositor', async () => {
    const v = new MockVaultClient();
    expect(await v.autoCompoundEnabled('alice')).toBe(true);
  });

  it('setAutoCompound(false) disables, (true) re-enables', async () => {
    const v = new MockVaultClient();
    await v.setAutoCompound('alice', false).signAndSubmit(depositor);
    expect(await v.autoCompoundEnabled('alice')).toBe(false);
    await v.setAutoCompound('alice', true).signAndSubmit(depositor);
    expect(await v.autoCompoundEnabled('alice')).toBe(true);
  });

  it('toggling one depositor never affects another', async () => {
    const v = new MockVaultClient();
    await v.setAutoCompound('alice', false).signAndSubmit(depositor);
    expect(await v.autoCompoundEnabled('alice')).toBe(false);
    expect(await v.autoCompoundEnabled('bob')).toBe(true); // untouched, still default
  });

  it('is depositor-signed — the keeper cannot toggle it', async () => {
    const v = new MockVaultClient();
    await expect(v.setAutoCompound('alice', false).signAndSubmit(keeper)).rejects.toThrow(
      /wrong signer/,
    );
  });

  it('does not touch the safety mandate (consent unchanged)', async () => {
    const v = new MockVaultClient();
    await v.setPolicyConsent('alice').signAndSubmit(depositor);
    await v.setAutoCompound('alice', false).signAndSubmit(depositor);
    expect(await v.hasConsent('alice')).toBe(true); // consent survives an auto-compound toggle
  });
});

describe('MockVaultClient — simulateFailure (test-only submit rejection)', () => {
  it('a rejected deposit resolves success:false and mints no shares', async () => {
    const v = new MockVaultClient();
    v.simulateFailure();

    const result = await v.deposit('alice', 'USD', 1_000n).signAndSubmit(depositor);

    // The seam reports a submitted-but-rejected transaction; it does NOT throw. Awaiting a write is
    // therefore not proof it landed — which is exactly what every write surface must guard.
    expect(result.success).toBe(false);
    expect(result.hash).toMatch(/^mock-tx-/);
    expect(await v.balanceOf('alice', 'USD')).toBe(0n);
    expect(await v.sharePrice('USD')).toBe(SHARE_PRICE_SCALE); // NAV untouched
  });

  it('the signature still happens — the chain, not the wallet, is what rejected', async () => {
    const v = new MockVaultClient();
    v.simulateFailure();
    const signed: string[] = [];
    const signer = { ...depositor, sign: async (xdr: string) => (signed.push(xdr), `sig:${xdr}`) };

    await v.deposit('alice', 'USD', 1_000n).signAndSubmit(signer);

    expect(signed).toHaveLength(1);
  });

  it('rejects every write kind with no effect (withdraw / consent / auto-compound / approve-exit)', async () => {
    const v = new MockVaultClient();
    await v.deposit('alice', 'USD', 1_000n).signAndSubmit(depositor);
    await v.proposeExit('USD', 'pool-frozen', 'pool-safe').signAndSubmit(keeper);
    const exit = await v.pendingExit('USD');
    v.simulateFailure();

    expect((await v.withdraw('alice', 'USD', 400n).signAndSubmit(depositor)).success).toBe(false);
    expect((await v.setPolicyConsent('alice').signAndSubmit(depositor)).success).toBe(false);
    expect((await v.setAutoCompound('alice', false).signAndSubmit(depositor)).success).toBe(false);
    expect((await v.approveExit('alice', exit!.id).signAndSubmit(depositor)).success).toBe(false);
    expect((await v.freeze('pool-usd').signAndSubmit(keeper)).success).toBe(false);

    expect(await v.balanceOf('alice', 'USD')).toBe(1_000n); // withdraw never burned
    expect(await v.hasConsent('alice')).toBe(false); // mandate never granted
    expect(await v.autoCompoundEnabled('alice')).toBe(true); // preference untouched (default ON)
    expect(await v.pendingExit('USD')).not.toBeNull(); // exit still pending
    expect(await v.poolStatus('pool-usd')).toBe('active'); // freeze never applied
  });

  it('still rejects a wrong-role signer before it can report a failure', async () => {
    const v = new MockVaultClient();
    v.simulateFailure();
    // The role guard is not a submit outcome — it must still throw, not decay into success:false.
    await expect(v.deposit('alice', 'USD', 1_000n).signAndSubmit(keeper)).rejects.toThrow(
      /wrong signer/,
    );
  });

  it('simulateFailure(false) restores the happy path', async () => {
    const v = new MockVaultClient();
    v.simulateFailure(true);
    await v.deposit('alice', 'USD', 1_000n).signAndSubmit(depositor);
    v.simulateFailure(false);

    const result = await v.deposit('alice', 'USD', 1_000n).signAndSubmit(depositor);

    expect(result.success).toBe(true);
    expect(await v.balanceOf('alice', 'USD')).toBe(1_000n); // only the second deposit landed
  });
});
