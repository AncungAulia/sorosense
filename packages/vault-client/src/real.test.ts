/**
 * Offline unit tests for {@link RealVaultClient}. No network: the generated bindings client is
 * replaced by an injected fake (`makeClient`) so we assert the seam ⇄ contract encoding boundary
 * and the two-phase write contract deterministically.
 */

import { describe, expect, it, vi } from 'vitest';
import { RealVaultClient, type BindingsVaultClient } from './real';
import { mockSigner } from './mock';

/** A fake read `AssembledTransaction` — only `.result` matters to the adapter. */
const readTx = <T>(result: T): Promise<{ result: T }> => Promise.resolve({ result });

/** A fake write `AssembledTransaction`: its `signAndSend` invokes the passed signer and reports success. */
function writeTx() {
  return {
    signAndSend: vi.fn(
      async (opts?: { signTransaction?: (xdr: string) => Promise<unknown> }) => {
        if (opts?.signTransaction) await opts.signTransaction('xdr-body');
        return {
          sendTransactionResponse: { hash: 'tx-hash-1' },
          getTransactionResponse: { status: 'SUCCESS' },
        };
      },
    ),
  };
}

/** Build an injected client whose methods are `vi.fn`s; overrides let a test shape specific returns. */
function makeClient(overrides: Partial<Record<keyof BindingsVaultClient, unknown>> = {}) {
  const base: Record<string, unknown> = {
    balance_of: vi.fn(() => readTx(0n)),
    share_price: vi.fn(() => readTx(1_000_000_000n)),
    value_of: vi.fn(() => readTx(0n)),
    pool_status: vi.fn(() => readTx({ tag: 'Active', values: undefined })),
    has_consent: vi.fn(() => readTx(false)),
    auto_compound_enabled: vi.fn(() => readTx(true)),
    active_pool: vi.fn(() => readTx(undefined)),
    pending_exit: vi.fn(() => readTx(undefined)),
    deposit: vi.fn(() => Promise.resolve(writeTx())),
    withdraw: vi.fn(() => Promise.resolve(writeTx())),
    set_policy_consent: vi.fn(() => Promise.resolve(writeTx())),
    set_auto_compound: vi.fn(() => Promise.resolve(writeTx())),
    approve_exit: vi.fn(() => Promise.resolve(writeTx())),
    allocate: vi.fn(() => Promise.resolve(writeTx())),
    deallocate: vi.fn(() => Promise.resolve(writeTx())),
    freeze: vi.fn(() => Promise.resolve(writeTx())),
    unfreeze: vi.fn(() => Promise.resolve(writeTx())),
    propose_exit: vi.fn(() => Promise.resolve(writeTx())),
    ...overrides,
  };
  return base as unknown as BindingsVaultClient;
}

const opts = {
  contractId: 'CCONTRACT',
  rpcUrl: 'https://rpc.example',
  networkPassphrase: 'Test SDF Network ; September 2015',
};

describe('RealVaultClient reads', () => {
  it('sharePrice decodes the i128 result to a bigint', async () => {
    const share_price = vi.fn(() => readTx(1_500_000_000n));
    const v = new RealVaultClient({ ...opts, client: makeClient({ share_price }) });

    expect(await v.sharePrice('USD')).toBe(1_500_000_000n);
    // Currency was encoded to the contract enum on the way in.
    expect(share_price).toHaveBeenCalledWith({ currency: { tag: 'Usd', values: undefined } });
  });

  it('poolStatus maps the contract tag to the seam union', async () => {
    const active = new RealVaultClient({
      ...opts,
      client: makeClient({ pool_status: vi.fn(() => readTx({ tag: 'Active', values: undefined })) }),
    });
    const frozen = new RealVaultClient({
      ...opts,
      client: makeClient({ pool_status: vi.fn(() => readTx({ tag: 'Frozen', values: undefined })) }),
    });

    expect(await active.poolStatus('blend-usdc')).toBe('active');
    expect(await frozen.poolStatus('blend-usdc')).toBe('frozen');
  });

  it('activePool maps Option<string> to PoolId | null', async () => {
    const some = new RealVaultClient({
      ...opts,
      client: makeClient({ active_pool: vi.fn(() => readTx('pool-abc')) }),
    });
    const none = new RealVaultClient({
      ...opts,
      client: makeClient({ active_pool: vi.fn(() => readTx(undefined)) }),
    });

    expect(await some.activePool('USD')).toBe('pool-abc');
    expect(await none.activePool('USD')).toBeNull();
  });

  it('pendingExit decodes ExitProposal (u64 id → string) or null', async () => {
    const withExit = new RealVaultClient({
      ...opts,
      client: makeClient({
        pending_exit: vi.fn(() =>
          readTx({
            currency: { tag: 'Eur', values: undefined },
            from_pool: 'pool-frozen',
            id: 7n,
            to_pool: 'pool-safe',
          }),
        ),
      }),
    });
    const none = new RealVaultClient({
      ...opts,
      client: makeClient({ pending_exit: vi.fn(() => readTx(undefined)) }),
    });

    expect(await withExit.pendingExit('EUR')).toEqual({
      id: '7',
      currency: 'EUR',
      fromPool: 'pool-frozen',
      toPool: 'pool-safe',
    });
    expect(await none.pendingExit('EUR')).toBeNull();
  });

  it('balanceOf / assetValueOf / hasConsent / autoCompoundEnabled decode straight through', async () => {
    const v = new RealVaultClient({
      ...opts,
      client: makeClient({
        balance_of: vi.fn(() => readTx(42n)),
        value_of: vi.fn(() => readTx(50n)),
        has_consent: vi.fn(() => readTx(true)),
        auto_compound_enabled: vi.fn(() => readTx(false)),
      }),
    });

    expect(await v.balanceOf('alice', 'MXN')).toBe(42n);
    expect(await v.assetValueOf('alice', 'MXN')).toBe(50n);
    expect(await v.hasConsent('alice')).toBe(true);
    expect(await v.autoCompoundEnabled('alice')).toBe(false);
  });
});

describe('RealVaultClient writes', () => {
  it('deposit encodes the currency and returns a PreparedTx requiring the depositor', () => {
    const v = new RealVaultClient({ ...opts, client: makeClient() });
    const tx = v.deposit('alice', 'USD', 1_000n);

    expect(tx.requiredSigner).toBe('depositor');
    expect(typeof tx.xdr).toBe('string');
  });

  it('signAndSubmit rejects a wrong-role signer without assembling or signing', async () => {
    const deposit = vi.fn(() => Promise.resolve(writeTx()));
    const v = new RealVaultClient({ ...opts, client: makeClient({ deposit }) });
    const keeper = mockSigner('keeper', 'sentinel');
    const signSpy = vi.spyOn(keeper, 'sign');

    await expect(v.deposit('alice', 'USD', 1_000n).signAndSubmit(keeper)).rejects.toThrow(
      /wrong signer/,
    );
    // Guard trips before any network assembly or signature.
    expect(deposit).not.toHaveBeenCalled();
    expect(signSpy).not.toHaveBeenCalled();
  });

  it('signAndSubmit with the right role signs, sends, and returns { hash, success }', async () => {
    const client = makeClient();
    const v = new RealVaultClient({ ...opts, client });
    const depositor = mockSigner('depositor', 'alice');
    const signSpy = vi.spyOn(depositor, 'sign');

    const result = await v.deposit('alice', 'USD', 1_000n).signAndSubmit(depositor);

    expect(client.deposit).toHaveBeenCalledWith({
      depositor: 'alice',
      currency: { tag: 'Usd', values: undefined },
      amount: 1_000n,
    });
    expect(signSpy).toHaveBeenCalledOnce();
    expect(result).toEqual({ hash: 'tx-hash-1', success: true });
  });

  it('keeper writes require the keeper role', async () => {
    const v = new RealVaultClient({ ...opts, client: makeClient() });
    const depositor = mockSigner('depositor', 'alice');
    const keeper = mockSigner('keeper', 'sentinel');

    const freeze = v.freeze('blend-usdc');
    expect(freeze.requiredSigner).toBe('keeper');
    await expect(freeze.signAndSubmit(depositor)).rejects.toThrow(/wrong signer/);
    expect((await v.freeze('blend-usdc').signAndSubmit(keeper)).success).toBe(true);
  });
});

describe('RealVaultClient pool registry (resolvePool)', () => {
  // A real C… pool address the slug maps to; the assertion is that the *Address*, not the slug,
  // reaches the bindings call.
  const POOL_ADDR = 'CBLENDUSDCPOOLADDRESSXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
  const registry: Record<string, string> = { 'blend-usdc': POOL_ADDR };
  const resolvePool = (poolId: string) => registry[poolId] as string;

  it('allocate resolves the slug to the pool Address before encoding', async () => {
    const client = makeClient();
    const v = new RealVaultClient({ ...opts, client, resolvePool });
    const keeper = mockSigner('keeper', 'sentinel');

    await v.allocate('blend-usdc', 'USD', 1_000n).signAndSubmit(keeper);

    expect(client.allocate).toHaveBeenCalledWith({
      pool: POOL_ADDR,
      currency: { tag: 'Usd', values: undefined },
      amount: 1_000n,
    });
  });

  it('freeze resolves the slug to the pool Address before encoding', async () => {
    const client = makeClient();
    const v = new RealVaultClient({ ...opts, client, resolvePool });
    const keeper = mockSigner('keeper', 'sentinel');

    await v.freeze('blend-usdc').signAndSubmit(keeper);

    expect(client.freeze).toHaveBeenCalledWith({ pool: POOL_ADDR });
  });

  it('poolStatus resolves the slug to the pool Address before reading', async () => {
    const pool_status = vi.fn(() => readTx({ tag: 'Active', values: undefined }));
    const v = new RealVaultClient({ ...opts, client: makeClient({ pool_status }), resolvePool });

    expect(await v.poolStatus('blend-usdc')).toBe('active');
    expect(pool_status).toHaveBeenCalledWith({ pool: POOL_ADDR });
  });

  it('proposeExit resolves both the from and to pool slugs', async () => {
    const toAddr = 'CBLENDSAFEPOOLADDRESSYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYY';
    const client = makeClient();
    const v = new RealVaultClient({
      ...opts,
      client,
      resolvePool: (id) => ({ 'blend-usdc': POOL_ADDR, 'blend-safe': toAddr })[id] as string,
    });
    const keeper = mockSigner('keeper', 'sentinel');

    await v.proposeExit('USD', 'blend-usdc', 'blend-safe').signAndSubmit(keeper);

    expect(client.propose_exit).toHaveBeenCalledWith({
      currency: { tag: 'Usd', values: undefined },
      from_pool: POOL_ADDR,
      to_pool: toAddr,
    });
  });

  it('throws a clear "unknown pool" error when the registry returns nothing for a slug', async () => {
    const v = new RealVaultClient({ ...opts, client: makeClient(), resolvePool });

    // The write is built eagerly, so the resolve failure surfaces at call time — before any
    // bindings/network work — as a clear message, not a raw ScVal encode failure.
    expect(() => v.allocate('nope', 'USD', 1_000n)).toThrow(/unknown pool: nope/);
    // The read is async, so the same clear failure surfaces as a rejection.
    await expect(v.poolStatus('nope')).rejects.toThrow(/unknown pool: nope/);
  });

  it('throws a clear "unknown pool" error when the resolver itself throws', () => {
    const v = new RealVaultClient({
      ...opts,
      client: makeClient(),
      resolvePool: (id) => {
        throw new Error(`no such pool ${id}`);
      },
    });

    expect(() => v.allocate('blend-usdc', 'USD', 1_000n)).toThrow(/unknown pool: blend-usdc/);
  });

  it('without resolvePool a slug passes straight through (behavior unchanged)', async () => {
    const client = makeClient();
    const v = new RealVaultClient({ ...opts, client });
    const keeper = mockSigner('keeper', 'sentinel');

    await v.allocate('blend-usdc', 'USD', 1_000n).signAndSubmit(keeper);

    expect(client.allocate).toHaveBeenCalledWith({
      pool: 'blend-usdc',
      currency: { tag: 'Usd', values: undefined },
      amount: 1_000n,
    });
  });

  it('a currency read (sharePrice) is unaffected by resolvePool', async () => {
    const share_price = vi.fn(() => readTx(1_500_000_000n));
    const v = new RealVaultClient({ ...opts, client: makeClient({ share_price }), resolvePool });

    expect(await v.sharePrice('USD')).toBe(1_500_000_000n);
    expect(share_price).toHaveBeenCalledWith({ currency: { tag: 'Usd', values: undefined } });
  });
});

describe('RealVaultClient reverse pool registry (poolIdFor) — R7 round trip', () => {
  const POOL_ADDR = 'CBLENDUSDCPOOLADDRESSXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
  const SAFE_ADDR = 'CBLENDSAFEPOOLADDRESSYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYY';
  // Both directions come from ONE map, so a pool cannot resolve one way and not the other (KTD5).
  const registry: Record<string, string> = { 'blend-usdc': POOL_ADDR, 'blend-safe': SAFE_ADDR };
  const resolvePool = (poolId: string) => registry[poolId] as string;
  const poolIdFor = (address: string) =>
    Object.keys(registry).find((slug) => registry[slug] === address) ?? address;

  it('activePool decodes the returned Address back to its seam slug', async () => {
    const v = new RealVaultClient({
      ...opts,
      client: makeClient({ active_pool: vi.fn(() => readTx(POOL_ADDR)) }),
      resolvePool,
      poolIdFor,
    });

    expect(await v.activePool('USD')).toBe('blend-usdc');
  });

  it('the exact useBuckets round trip: activePool → poolStatus resolves without throwing', async () => {
    const pool_status = vi.fn(() => readTx({ tag: 'Frozen', values: undefined }));
    const v = new RealVaultClient({
      ...opts,
      client: makeClient({ active_pool: vi.fn(() => readTx(POOL_ADDR)), pool_status }),
      resolvePool,
      poolIdFor,
    });

    // Without the reverse decode this second call throws `unknown pool: C…` — the address is not a
    // slug the forward registry knows, and Home would blank the user's bucket.
    const pool = await v.activePool('USD');
    expect(await v.poolStatus(pool as string)).toBe('frozen');
    // The address, not the slug, is what actually reached the contract on the way back in.
    expect(pool_status).toHaveBeenCalledWith({ pool: POOL_ADDR });
  });

  it('pendingExit decodes fromPool and toPool through the same reverse map', async () => {
    const v = new RealVaultClient({
      ...opts,
      client: makeClient({
        pending_exit: vi.fn(() =>
          readTx({
            currency: { tag: 'Usd', values: undefined },
            from_pool: POOL_ADDR,
            id: 3n,
            to_pool: SAFE_ADDR,
          }),
        ),
      }),
      resolvePool,
      poolIdFor,
    });

    expect(await v.pendingExit('USD')).toEqual({
      id: '3',
      currency: 'USD',
      fromPool: 'blend-usdc',
      toPool: 'blend-safe',
    });
  });

  it('an address absent from the registry decodes to itself and does not throw', async () => {
    const UNKNOWN = 'CUNKNOWNPOOLADDRESSZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ';
    const v = new RealVaultClient({
      ...opts,
      client: makeClient({ active_pool: vi.fn(() => readTx(UNKNOWN)) }),
      resolvePool,
      poolIdFor,
    });

    // A pool this config does not know about is a display concern, never a reason to fail the read.
    expect(await v.activePool('USD')).toBe(UNKNOWN);
  });

  it('a throwing reverse resolver still yields the address rather than failing the read', async () => {
    const v = new RealVaultClient({
      ...opts,
      client: makeClient({ active_pool: vi.fn(() => readTx(POOL_ADDR)) }),
      poolIdFor: (address) => {
        throw new Error(`no slug for ${address}`);
      },
    });

    expect(await v.activePool('USD')).toBe(POOL_ADDR);
  });

  it('the forward direction still encodes a slug to its Address for writes', async () => {
    const client = makeClient();
    const v = new RealVaultClient({ ...opts, client, resolvePool, poolIdFor });
    const keeper = mockSigner('keeper', 'sentinel');

    await v.allocate('blend-usdc', 'USD', 1_000n).signAndSubmit(keeper);
    await v.freeze('blend-usdc').signAndSubmit(keeper);

    expect(client.allocate).toHaveBeenCalledWith({
      pool: POOL_ADDR,
      currency: { tag: 'Usd', values: undefined },
      amount: 1_000n,
    });
    expect(client.freeze).toHaveBeenCalledWith({ pool: POOL_ADDR });
  });

  it('without poolIdFor an address passes straight through (behavior unchanged)', async () => {
    const v = new RealVaultClient({
      ...opts,
      client: makeClient({ active_pool: vi.fn(() => readTx(POOL_ADDR)) }),
    });

    expect(await v.activePool('USD')).toBe(POOL_ADDR);
  });

  it('a bucket with no allocation still reads null (the state the demo starts in — A5)', async () => {
    const v = new RealVaultClient({
      ...opts,
      client: makeClient({ active_pool: vi.fn(() => readTx(undefined)) }),
      resolvePool,
      poolIdFor,
    });

    expect(await v.activePool('USD')).toBeNull();
  });
});
