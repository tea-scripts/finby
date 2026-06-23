import { ApiError, type HttpClient } from './http';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface AuthedClientConfig {
  http: HttpClient;
  getAccessToken: () => string | null;
  getRefreshToken: () => string | null;
  setTokens: (pair: TokenPair) => void;
  onAuthCleared: () => void;
  /** Defaults to '/auth/refresh'. */
  refreshPath?: string;
}

export interface AuthedClient {
  authed<T>(path: string, init?: RequestInit): Promise<T>;
  authedStream(path: string, init?: RequestInit): Promise<Response>;
  tryRefresh(): Promise<boolean>;
}

export function createAuthedClient(config: AuthedClientConfig): AuthedClient {
  const { http, getAccessToken, getRefreshToken, setTokens, onAuthCleared } = config;
  const refreshPath = config.refreshPath ?? '/auth/refresh';

  async function tryRefresh(): Promise<boolean> {
    const refreshToken = getRefreshToken();
    if (!refreshToken) return false;
    try {
      const pair = await http.apiFetch<TokenPair>(refreshPath, {
        method: 'POST',
        body: JSON.stringify({ refreshToken }),
      });
      setTokens({ accessToken: pair.accessToken, refreshToken: pair.refreshToken });
      return true;
    } catch {
      // Refresh token is dead — drop straight to a clean signed-out state.
      onAuthCleared();
      return false;
    }
  }

  async function authed<T>(path: string, init: RequestInit = {}): Promise<T> {
    const withToken = (token: string | null): RequestInit => ({
      ...init,
      headers: {
        ...(init.headers ?? {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });

    try {
      return await http.apiFetch<T>(path, withToken(getAccessToken()));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401 && getRefreshToken()) {
        const refreshed = await tryRefresh();
        if (refreshed) {
          return await http.apiFetch<T>(path, withToken(getAccessToken()));
        }
      }
      throw err;
    }
  }

  async function authedStream(path: string, init: RequestInit = {}): Promise<Response> {
    const run = async (token: string | null): Promise<Response> =>
      fetch(`${http.baseUrl}${path}`, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          ...(init.headers ?? {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

    let res: Response;
    try {
      res = await run(getAccessToken());
    } catch {
      throw new ApiError(0, 'NETWORK', "We couldn't reach Finby. Please check your connection and try again.");
    }

    if (res.status === 401 && getRefreshToken()) {
      const refreshed = await tryRefresh();
      if (refreshed) res = await run(getAccessToken());
    }

    if (!res.ok) {
      const text = await res.text();
      const body = (text ? JSON.parse(text) : {}) as { error?: string; message?: string; details?: unknown };
      throw new ApiError(
        res.status,
        body.error ?? 'ERROR',
        body.message ?? 'Something went wrong. Please try again.',
        body.details,
      );
    }
    return res;
  }

  return { authed, authedStream, tryRefresh };
}
