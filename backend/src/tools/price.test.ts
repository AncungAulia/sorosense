/**
 * Reflector oracle read (U1c) — object-real, offline. The tests inject an {@link OracleSource} that
 * returns canned `ScVal`s, so the REAL argument encoding and the REAL `Option<PriceData>` decode run;
 * only the RPC transport is faked. No test may touch the network (the live smoke is a separate,
 * operator-run step).
 *
 * The canned values are the ones the deployed testnet oracle actually returns (checked live):
 * `lastprice(Other("EURC"))` = `{ price: 114433043263595, timestamp: … }` at `decimals() == 14`.
 */

import { nativeToScVal, xdr } from '@stellar/stellar-sdk';
import { describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_REFLECTOR_DECIMALS,
  DEFAULT_REFLECTOR_ORACLE_ID,
  getReflectorPrice,
  makeReflectorReader,
  OracleTimeoutError,
  oracleConfigFrom,
  otherAsset,
  reflectorDecimals,
  type OracleSource,
} from './price.js';

/** The env a live backend runs with (never used to reach the network here — a stub source intercepts). */
const LIVE_ENV = {
  STELLAR_RPC_URL: 'https://rpc.invalid',
  STELLAR_NETWORK_PASSPHRASE: 'Test SDF Network ; September 2015',
} as NodeJS.ProcessEnv;

/** `Some(PriceData { price, timestamp })` — the struct decodes as an ScMap keyed by field symbol. */
const somePriceData = (price: bigint, timestamp: bigint): xdr.ScVal =>
  xdr.ScVal.scvMap([
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol('price'),
      val: nativeToScVal(price, { type: 'i128' }),
    }),
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol('timestamp'),
      val: nativeToScVal(timestamp, { type: 'u64' }),
    }),
  ]);

/** `Option::None` — the oracle returns an ScVal void for a symbol it does not carry. */
const none = (): xdr.ScVal => xdr.ScVal.scvVoid();

/**
 * A method-aware stub feed: `lastprice` and `decimals` answer separately, exactly as the contract does.
 * `decimals` defaults to the 14 the deployed oracle reports, so a reader with nothing pinned reads it.
 */
const feed = (lastprice: xdr.ScVal | undefined, decimals = 14): OracleSource => ({
  simulate: vi.fn(async (method: string) =>
    method === 'decimals' ? nativeToScVal(decimals, { type: 'u32' }) : lastprice,
  ),
});

/** Back-compat alias: most cases only care about what `lastprice` returns. */
const sourceReturning = (retval: xdr.ScVal | undefined): OracleSource => feed(retval);

describe('getReflectorPrice — reads the on-chain SEP-40 oracle', () => {
  it('decodes Some(PriceData) at the feed scale: 114433043263595 / 1e14 = 1.1443… USD/EURC', async () => {
    const source = sourceReturning(somePriceData(114_433_043_263_595n, 1_784_044_800n));

    const r = await getReflectorPrice('EURC', { source, env: LIVE_ENV });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.price).toBeCloseTo(1.14433043263595, 12);
    expect(r.value.asset).toBe('EURC');
    expect(r.value.ts).toBe(1_784_044_800);
    expect(r.value.source).toBe('reflector');
  });

  it('calls lastprice with the Asset enum encoded as Other(Symbol) — [symbol("Other"), symbol(sym)]', async () => {
    const source = sourceReturning(somePriceData(100_063_445_096_971n, 1n));

    await getReflectorPrice('USDC', { source, env: LIVE_ENV });

    const call = vi.mocked(source.simulate).mock.calls.find(([method]) => method === 'lastprice');
    expect(call).toBeDefined();
    // Compare on the XDR, so a change in how the enum is built is caught rather than assumed.
    expect(call?.[1]?.[0]?.toXDR('base64')).toBe(otherAsset('USDC').toXDR('base64'));
  });

  it('reads the scale from the ORACLE when nothing pins it — a repointed feed cannot silently 10,000x a rate', async () => {
    // Same raw i128, a feed that reports 18 decimals: the rate must follow the feed, not a stale env pin.
    const source = feed(somePriceData(1_144_330_000_000_000_000n, 1n), 18);

    const r = await getReflectorPrice('EURC', { source, env: LIVE_ENV });

    expect(r.ok && r.value.price).toBeCloseTo(1.14433, 9);
    expect(vi.mocked(source.simulate).mock.calls.some(([m]) => m === 'decimals')).toBe(true);
  });

  it('reads decimals() once per feed, not once per price', async () => {
    const source = feed(somePriceData(114_433_043_263_595n, 1n));
    const read = makeReflectorReader({ source, env: LIVE_ENV });

    await read('EURC');
    await read('USDC');

    const decimalsCalls = vi.mocked(source.simulate).mock.calls.filter(([m]) => m === 'decimals');
    expect(decimalsCalls).toHaveLength(1);
  });

  it('honours REFLECTOR_DECIMALS so a feed on a different scale is a config change, not a patch', async () => {
    const source = sourceReturning(somePriceData(1_143_300n, 1n)); // 6-dp feed

    const r = await getReflectorPrice('EURC', { source, env: LIVE_ENV, decimals: 6 });

    expect(r.ok && r.value.price).toBeCloseTo(1.1433, 9);
    // A pinned scale is the escape hatch: it must NOT cost an oracle round trip.
    expect(vi.mocked(source.simulate).mock.calls.some(([m]) => m === 'decimals')).toBe(false);
  });

  it('treats Option::None as not_found — the feed carries no MXN (fail-closed, never a rate of 1)', async () => {
    const r = await getReflectorPrice('MXN', { source: sourceReturning(none()), env: LIVE_ENV });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe('not_found');
  });

  it('treats a malformed return value as a parse error, never a throw', async () => {
    const notAStruct = sourceReturning(xdr.ScVal.scvSymbol('nonsense'));

    const r = await getReflectorPrice('EURC', { source: notAStruct, env: LIVE_ENV });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe('parse');
  });

  it('rejects a zero price rather than blending real money to a silent $0 (R6)', async () => {
    const zero = sourceReturning(somePriceData(0n, 1n));

    const r = await getReflectorPrice('EURC', { source: zero, env: LIVE_ENV });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe('parse');
  });

  it('turns an RPC/simulation failure into a typed error, never a throw', async () => {
    const failing: OracleSource = {
      simulate: async () => {
        throw new Error('lastprice simulation failed: HostError');
      },
    };

    const r = await getReflectorPrice('EURC', { source: failing, env: LIVE_ENV });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe('unavailable');
  });

  it('an empty simulation result is unavailable, not a price', async () => {
    const r = await getReflectorPrice('EURC', { source: sourceReturning(undefined), env: LIVE_ENV });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe('unavailable');
  });

  it('turns a stalled feed into err(timeout), not a hung request', async () => {
    const stalling: OracleSource = {
      simulate: async () => {
        throw new OracleTimeoutError('reflector lastprice timed out after 8000ms');
      },
    };

    const r = await getReflectorPrice('EURC', { source: stalling, env: LIVE_ENV, decimals: 14 });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe('timeout'); // → HTTP 504, the code the REST reader used to produce
  });

  it('with no network env configured it fails closed WITHOUT constructing an RPC client', async () => {
    // No `source` injected and no env: the live source would be built here if the guard were missing.
    const r = await getReflectorPrice('EURC', { env: {} as NodeJS.ProcessEnv });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe('unavailable');
    expect(r.error).toMatch(/not configured/);
  });

  it('a typo in REFLECTOR_ORACLE_ID is a typed error, not a thrown 500', async () => {
    // The REAL live source is constructed here (no stub) — `new Contract('COTHER')` throws. Offline: the
    // RPC client is lazy, so nothing is dialed; the read fails at construction, before any request.
    const r = await getReflectorPrice('EURC', {
      env: { ...LIVE_ENV, REFLECTOR_ORACLE_ID: 'COTHER' } as NodeJS.ProcessEnv,
    });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe('unavailable');
    expect(r.error).toMatch(/misconfigured/);
  });
});

describe('oracle config is env-driven (a wrong id is an .env edit, not a patch release)', () => {
  it('defaults to the deployed testnet oracle and lets REFLECTOR_ORACLE_ID override it', () => {
    expect(oracleConfigFrom(LIVE_ENV)?.oracleId).toBe(DEFAULT_REFLECTOR_ORACLE_ID);
    expect(oracleConfigFrom({ ...LIVE_ENV, REFLECTOR_ORACLE_ID: 'COTHER' })?.oracleId).toBe('COTHER');
  });

  it('is null without the network env — mock mode never constructs an oracle client', () => {
    expect(oracleConfigFrom({} as NodeJS.ProcessEnv)).toBeNull();
    expect(oracleConfigFrom({ STELLAR_RPC_URL: 'https://rpc.invalid' } as NodeJS.ProcessEnv)).toBeNull();
  });

  it('pins the scale only when REFLECTOR_DECIMALS says so — unset (or garbage) defers to the oracle', () => {
    expect(reflectorDecimals({} as NodeJS.ProcessEnv)).toBeUndefined(); // ⇒ read decimals() from the feed
    expect(reflectorDecimals({ REFLECTOR_DECIMALS: '7' } as NodeJS.ProcessEnv)).toBe(7);
    expect(reflectorDecimals({ REFLECTOR_DECIMALS: 'abc' } as NodeJS.ProcessEnv)).toBeUndefined();
    expect(DEFAULT_REFLECTOR_DECIMALS).toBe(14); // what the deployed oracle reports (verified live)
  });
});
