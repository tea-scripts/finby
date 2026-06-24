import type { SecureStoreLike } from './token-store';

const LOCK_CODE_KEY = 'finby.lockcode';

/** Hashing primitives, injected so the logic is testable with a fake (the real
 *  binding lives in `crypto.native.ts`). */
export interface PinHasher {
  digest(data: string): Promise<string>;
  randomSalt(): Promise<string>;
}

export interface LockCode {
  isSet(): Promise<boolean>;
  set(pin: string): Promise<void>;
  verify(pin: string): Promise<boolean>;
  clear(): Promise<void>;
}

/** The app-unlock PIN, stored salted + hashed in SecureStore (never plaintext).
 *  This is a convenience lock over an already-authenticated session, not the
 *  primary auth — the bearer token is. */
export function createLockCode(secureStore: SecureStoreLike, hasher: PinHasher): LockCode {
  return {
    async isSet() {
      return (await secureStore.getItemAsync(LOCK_CODE_KEY)) !== null;
    },
    async set(pin) {
      const salt = await hasher.randomSalt();
      const hash = await hasher.digest(salt + pin);
      await secureStore.setItemAsync(LOCK_CODE_KEY, JSON.stringify({ salt, hash }));
    },
    async verify(pin) {
      const raw = await secureStore.getItemAsync(LOCK_CODE_KEY);
      if (!raw) return false;
      try {
        const { salt, hash } = JSON.parse(raw) as { salt: string; hash: string };
        if (typeof salt !== 'string' || typeof hash !== 'string') return false;
        return (await hasher.digest(salt + pin)) === hash;
      } catch {
        return false;
      }
    },
    async clear() {
      await secureStore.deleteItemAsync(LOCK_CODE_KEY);
    },
  };
}
