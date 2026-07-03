import { afterEach, describe, expect, it, vi } from 'vitest';
import { getJson } from './http.js';

afterEach(() => vi.unstubAllGlobals());

const stubFetch = (impl: () => Promise<Response> | Response) =>
  vi.stubGlobal('fetch', vi.fn(impl));

describe('getJson', () => {
  it('returns ok with parsed JSON on 2xx', async () => {
    stubFetch(() => new Response(JSON.stringify({ hello: 'world' }), { status: 200 }));
    const r = await getJson<{ hello: string }>('https://x.test/data');
    expect(r.ok && r.value.hello).toBe('world');
  });

  it('returns a typed http error on non-2xx', async () => {
    stubFetch(() => new Response('nope', { status: 503 }));
    const r = await getJson('https://x.test/down');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('http');
  });

  it('returns a typed timeout error when the request aborts', async () => {
    stubFetch(() => {
      const e = new Error('aborted');
      e.name = 'AbortError';
      throw e;
    });
    const r = await getJson('https://x.test/slow', { timeoutMs: 5 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('timeout');
  });

  it('returns a typed parse error on invalid JSON', async () => {
    stubFetch(() => new Response('<html>not json</html>', { status: 200 }));
    const r = await getJson('https://x.test/html');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('parse');
  });
});
