import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, createHttpClient } from './http';

const BASE = 'https://api.test/v1';

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(impl: typeof fetch) {
  vi.stubGlobal('fetch', vi.fn(impl));
}

describe('createHttpClient.apiFetch', () => {
  it('parses a JSON success body and prefixes the base URL', async () => {
    stubFetch(async (url) => {
      expect(url).toBe(`${BASE}/ping`);
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    const http = createHttpClient({ baseUrl: BASE });
    await expect(http.apiFetch<{ ok: boolean }>('/ping')).resolves.toEqual({ ok: true });
  });

  it('throws ApiError carrying status/code/message on a non-ok response', async () => {
    stubFetch(async () =>
      new Response(JSON.stringify({ error: 'BAD', message: 'nope' }), { status: 422 }),
    );
    const http = createHttpClient({ baseUrl: BASE });
    await expect(http.apiFetch('/x')).rejects.toMatchObject({
      status: 422,
      code: 'BAD',
      message: 'nope',
    });
  });

  it('throws a NETWORK ApiError when fetch rejects', async () => {
    stubFetch(async () => {
      throw new Error('offline');
    });
    const http = createHttpClient({ baseUrl: BASE });
    await expect(http.apiFetch('/x')).rejects.toMatchObject({ status: 0, code: 'NETWORK' });
  });

  it('does not force JSON Content-Type for FormData bodies', async () => {
    let sentHeaders: Record<string, string> = {};
    stubFetch(async (_url, init) => {
      sentHeaders = (init?.headers ?? {}) as Record<string, string>;
      return new Response('null', { status: 200 });
    });
    const http = createHttpClient({ baseUrl: BASE });
    await http.apiFetch('/upload', { method: 'POST', body: new FormData() });
    expect(sentHeaders['Content-Type']).toBeUndefined();
  });
});
