import type { SecureStoreLike } from './token-store';

const LOCK_KEY = 'finby.lockEnabled';

export interface LockPref {
  /** Whether the biometric app-lock is enabled. Defaults to ON when unset
   *  (so the lock is on after a first login until the user turns it off). */
  isEnabled(): Promise<boolean>;
  setEnabled(enabled: boolean): Promise<void>;
}

/** Persisted preference for the biometric app-lock. Persists across logout
 *  (it's a device-level preference). */
export function createLockPref(secureStore: SecureStoreLike): LockPref {
  return {
    async isEnabled() {
      const raw = await secureStore.getItemAsync(LOCK_KEY);
      return raw === null ? true : raw === '1';
    },
    async setEnabled(enabled) {
      await secureStore.setItemAsync(LOCK_KEY, enabled ? '1' : '0');
    },
  };
}
