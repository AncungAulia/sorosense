/**
 * U4 faucet route — object-real integration over a booted Hono app with a FAKE minter (no network, no
 * secret). Proves the request contract: mint is called with the right SAC + address, only USD/EUR are
 * served, rate-limiting works, a missing trustline returns a changeTrust hint, and no secret is ever in
 * a response. The real minter (`faucet-minter.ts`) is validated by the live smoke (U6), not here.
 */

import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { mountFaucet, type FaucetMinter, type MintResult } from './faucet.js';

const USDC = 'CDGJ4WQZFY3TH5LX442ZDJVPB5I2VMNEENRX23AYNMJFXLDMZQY5PSKA';
const EURC = 'CCAEI5YDRHKKAHGBTC6K2P6FRZTBBV7H6TEKDDSEINPGHKY3XRBCT44A';
const ADDR = 'GAB5UOJLZWZUXVUB3POD3RBQTD53PQGVOVKVAONBDFXCOO2IY3LIDFJB';

/** A fake minter recording its calls; returns success unless told otherwise. */
function fakeMinter(result: MintResult = { ok: true, hash: 'tx-abc' }): FaucetMinter & { calls: unknown[] } {
  const calls: unknown[] = [];
  return {
    calls,
    mint: vi.fn(async (sac: string, to: string, amount: bigint): Promise<MintResult> => {
      calls.push({ sac, to, amount });
      return result;
    }),
  };
}

function boot(minter: FaucetMinter, over: Partial<Parameters<typeof mountFaucet>[1]> = {}) {
  const app = new Hono();
  mountFaucet(app, { sac: { USD: USDC, EUR: EURC }, minter, ...over });
  return app;
}

const post = (app: Hono, body: unknown) =>
  app.request('/faucet', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('POST /faucet', () => {
  it('mints the right SAC to the address and returns a hash, no secret', async () => {
    const minter = fakeMinter();
    const res = await post(boot(minter), { address: ADDR, currency: 'USD' });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ ok: true, hash: 'tx-abc', currency: 'USD' });
    expect(minter.calls[0]).toMatchObject({ sac: USDC, to: ADDR });
    // No secret-shaped field leaks into the response.
    expect(JSON.stringify(json)).not.toMatch(/secret|seed|S[A-Z2-7]{55}/);
  });

  it('serves EUR with the EURC SAC', async () => {
    const minter = fakeMinter();
    await post(boot(minter), { address: ADDR, currency: 'EUR' });
    expect(minter.calls[0]).toMatchObject({ sac: EURC });
  });

  it('rejects MXN and unknown currencies with 400, no mint', async () => {
    const minter = fakeMinter();
    const app = boot(minter);
    expect((await post(app, { address: ADDR, currency: 'MXN' })).status).toBe(400);
    expect((await post(app, { address: ADDR, currency: 'GBP' })).status).toBe(400);
    expect(minter.mint).not.toHaveBeenCalled();
  });

  it('rejects a malformed address with 400', async () => {
    const minter = fakeMinter();
    const res = await post(boot(minter), { address: 'not-an-address', currency: 'USD' });
    expect(res.status).toBe(400);
    expect(minter.mint).not.toHaveBeenCalled();
  });

  it('rate-limits repeat requests from the same address (429)', async () => {
    let t = 1_000_000;
    const minter = fakeMinter();
    const app = boot(minter, { rateLimitMs: 60_000, now: () => t });
    expect((await post(app, { address: ADDR, currency: 'USD' })).status).toBe(200);
    expect((await post(app, { address: ADDR, currency: 'USD' })).status).toBe(429); // same clock, within window
    t += 60_001; // cooldown elapsed
    expect((await post(app, { address: ADDR, currency: 'USD' })).status).toBe(200);
  });

  it('returns a changeTrust hint (409) when the recipient has no trustline', async () => {
    const minter = fakeMinter({ ok: false, reason: 'no-trustline' });
    const res = await post(boot(minter), { address: ADDR, currency: 'USD' });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ needsChangeTrust: true, currency: 'USD', sac: USDC });
  });

  it('is not mounted when the app never calls mountFaucet (env-gated → 404)', async () => {
    const app = new Hono();
    expect((await post(app, { address: ADDR, currency: 'USD' })).status).toBe(404);
  });
});
