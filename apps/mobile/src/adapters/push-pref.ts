import type { SecureStoreLike } from './token-store';

const PUSH_TOKEN_KEY = 'finby.push-token';

export interface PushPref {
  getToken(): Promise<string | null>;
  setToken(token: string): Promise<void>;
  clear(): Promise<void>;
}

/** Persisted Expo push token, so the enabled-state survives app restarts
 *  (the in-memory push store alone doesn't). */
export function createPushPref(secureStore: SecureStoreLike): PushPref {
  return {
    async getToken() {
      return secureStore.getItemAsync(PUSH_TOKEN_KEY);
    },
    async setToken(token) {
      await secureStore.setItemAsync(PUSH_TOKEN_KEY, token);
    },
    async clear() {
      await secureStore.deleteItemAsync(PUSH_TOKEN_KEY);
    },
  };
}
