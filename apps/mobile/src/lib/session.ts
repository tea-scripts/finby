import { createAuthedClient, createAuthApi, createHttpClient, type AuthedFetch, type AuthedStream, type TokenPair } from '@finby/core';
import type { AuthResult, RegisterInput } from '@finby/shared';
import type { TokenStore } from '../adapters/token-store';

export interface MobileSession {
  authed: AuthedFetch;
  authedStream: AuthedStream;
  tryRefresh(): Promise<boolean>;
  setSession(pair: TokenPair): Promise<void>;
  clearSession(): Promise<void>;
  hydrate(): Promise<boolean>;
  getAccessToken(): string | null;
  login(email: string, password: string): Promise<AuthResult>;
  register(input: RegisterInput): Promise<AuthResult>;
  logout(): Promise<void>;
}

/** The mobile auth/transport container. Tokens live in memory (synchronous
 *  getters the core client needs) and are mirrored to the secure token store.
 *  Reuses @finby/core's http + authed client so refresh/streaming logic is
 *  single-sourced; only storage + the streaming fetch differ from web. */
export function createMobileSession(deps: {
  apiBase: string;
  tokenStore: TokenStore;
  fetchImpl?: typeof fetch;
}): MobileSession {
  let accessToken: string | null = null;
  let refreshToken: string | null = null;

  const http = createHttpClient({ baseUrl: deps.apiBase, fetchImpl: deps.fetchImpl });

  const client = createAuthedClient({
    http,
    getAccessToken: () => accessToken,
    getRefreshToken: () => refreshToken,
    setTokens: (pair) => {
      accessToken = pair.accessToken;
      refreshToken = pair.refreshToken;
      // Fire-and-forget persistence; in-memory state is the source of truth for reads.
      void deps.tokenStore.save(pair);
    },
    onAuthCleared: () => {
      accessToken = null;
      refreshToken = null;
      void deps.tokenStore.clear();
    },
    fetchImpl: deps.fetchImpl,
  });

  const authApi = createAuthApi({ authed: client.authed, apiFetch: http.apiFetch });

  return {
    authed: client.authed,
    authedStream: client.authedStream,
    tryRefresh: client.tryRefresh,
    getAccessToken: () => accessToken,
    async setSession(pair) {
      accessToken = pair.accessToken;
      refreshToken = pair.refreshToken;
      await deps.tokenStore.save(pair);
    },
    async clearSession() {
      accessToken = null;
      refreshToken = null;
      await deps.tokenStore.clear();
    },
    async hydrate() {
      const stored = await deps.tokenStore.load();
      if (!stored) return false;
      accessToken = stored.accessToken;
      refreshToken = stored.refreshToken;
      return true;
    },
    async login(email, password) {
      const result = await authApi.login(email, password);
      accessToken = result.accessToken;
      refreshToken = result.refreshToken;
      await deps.tokenStore.save({ accessToken: result.accessToken, refreshToken: result.refreshToken });
      return result;
    },
    async register(input) {
      const result = await authApi.register(input);
      accessToken = result.accessToken;
      refreshToken = result.refreshToken;
      await deps.tokenStore.save({ accessToken: result.accessToken, refreshToken: result.refreshToken });
      return result;
    },
    async logout() {
      await authApi.logout(refreshToken);
      accessToken = null;
      refreshToken = null;
      await deps.tokenStore.clear();
    },
  };
}
