import { afterEach, describe, expect, it, vi } from 'vitest';
import { getReflectorPrice } from './price.js';

afterEach(() => vi.unstubAllGlobals());

describe('getReflectorPrice', () => {
  it('returns a numeric price on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Response(JSON.stringify({ price: 1.0002 }), { status: 200 })),
    );
    const r = await getReflectorPrice('USDC', 'https://reflector.test');
    expect(r.ok && r.value.price).toBe(1.0002);
  });

  it('surfaces a timeout as a typed failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        const e = new Error('aborted');
        e.name = 'AbortError';
        throw e;
      }),
    );
    const r = await getReflectorPrice('USDC', 'https://reflector.test');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('timeout');
  });

  it('treats a missing/non-numeric price as a parse error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Response(JSON.stringify({ price: 'n/a' }), { status: 200 })),
    );
    const r = await getReflectorPrice('USDC', 'https://reflector.test');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('parse');
  });
});
