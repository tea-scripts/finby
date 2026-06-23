import type { TokenPair } from '@finby/core';

const TOKENS_KEY = 'finby.tokens';

export interface SecureStoreLike {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

export interface TokenStore {
  load(): Promise<TokenPair | null>;
  save(pair: TokenPair): Promise<void>;
  clear(): Promise<void>;
}

/** Persist the bearer token pair in the platform secure store (Keychain/Keystore).
 *  Logic is decoupled from expo-secure-store via the injected SecureStoreLike. */
export function createTokenStore(secureStore: SecureStoreLike): TokenStore {
  return {
    async load() {
      const raw = await secureStore.getItemAsync(TOKENS_KEY);
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw) as Partial<TokenPair>;
        if (typeof parsed.accessToken === 'string' && typeof parsed.refreshToken === 'string') {
          return { accessToken: parsed.accessToken, refreshToken: parsed.refreshToken };
        }
        return null;
      } catch {
        return null;
      }
    },
    async save(pair) {
      await secureStore.setItemAsync(TOKENS_KEY, JSON.stringify(pair));
    },
    async clear() {
      await secureStore.deleteItemAsync(TOKENS_KEY);
    },
  };
}
