import { describe, expect, it, vi } from 'vitest';
import { ApiError, type HttpClient } from './http';
import { createAuthedClient, type TokenPair } from './authed';

function makeHttp(responder: <T>(path: string, init?: RequestInit) => Promise<T>): HttpClient {
  return { baseUrl: 'https://api.test/v1', apiFetch: vi.fn(responder) as HttpClient['apiFetch'] };
}

describe('createAuthedClient.authed', () => {
  it('attaches the bearer token and returns the body', async () => {
    const http = makeHttp(async (_p, init) => {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      expect(headers.Authorization).toBe('Bearer access-1');
      return { value: 1 } as unknown;
    });
    const client = createAuthedClient({
      http,
      getAccessToken: () => 'access-1',
      getRefreshToken: () => 'refresh-1',
      setTokens: () => {},
      onAuthCleared: () => {},
    });
    await expect(client.authed<{ value: number }>('/me')).resolves.toEqual({ value: 1 });
  });

  it('refreshes once on a 401 then retries the original request', async () => {
    let access = 'stale';
    const calls: string[] = [];
    const http = makeHttp(async (path: string, init?: RequestInit) => {
      calls.push(path);
      if (path === '/auth/refresh') {
        access = 'fresh';
        return { accessToken: 'fresh', refreshToken: 'refresh-2' } as unknown;
      }
      const headers = (init?.headers ?? {}) as Record<string, string>;
      if (headers.Authorization === 'Bearer stale') {
        throw new ApiError(401, 'UNAUTHORIZED', 'expired');
      }
      return { ok: true } as unknown;
    });
    const setTokens = vi.fn<(p: TokenPair) => void>();
    const client = createAuthedClient({
      http,
      getAccessToken: () => access,
      getRefreshToken: () => 'refresh-1',
      setTokens,
      onAuthCleared: () => {},
    });
    await expect(client.authed('/me')).resolves.toEqual({ ok: true });
    expect(calls).toEqual(['/me', '/auth/refresh', '/me']);
    expect(setTokens).toHaveBeenCalledWith({ accessToken: 'fresh', refreshToken: 'refresh-2' });
  });

  it('clears auth and returns false when refresh fails', async () => {
    const http = makeHttp(async (path: string) => {
      if (path === '/auth/refresh') throw new ApiError(401, 'UNAUTHORIZED', 'dead');
      return {} as unknown;
    });
    const onAuthCleared = vi.fn();
    const client = createAuthedClient({
      http,
      getAccessToken: () => 'x',
      getRefreshToken: () => 'refresh-dead',
      setTokens: () => {},
      onAuthCleared,
    });
    await expect(client.tryRefresh()).resolves.toBe(false);
    expect(onAuthCleared).toHaveBeenCalledTimes(1);
  });

  it('tryRefresh returns false immediately when there is no refresh token', async () => {
    const http = makeHttp(async () => ({}) as unknown);
    const client = createAuthedClient({
      http,
      getAccessToken: () => null,
      getRefreshToken: () => null,
      setTokens: () => {},
      onAuthCleared: () => {},
    });
    await expect(client.tryRefresh()).resolves.toBe(false);
    expect(http.apiFetch).not.toHaveBeenCalled();
  });
});
