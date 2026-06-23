import type { ApiUser, ApiWorkspace } from '@finby/shared';
import type { SecureStoreLike } from './token-store';

const IDENTITY_KEY = 'finby.identity';

export interface Identity {
  user: ApiUser;
  workspace: ApiWorkspace;
}

export interface IdentityStore {
  load(): Promise<Identity | null>;
  save(identity: Identity): Promise<void>;
  clear(): Promise<void>;
}

/** Persist the restorable identity (user + workspace) so cold start rehydrates
 *  without a network call. Mirrors how web persists its auth store to
 *  localStorage; the SecureStore JSON is small (well under the platform limit). */
export function createIdentityStore(secureStore: SecureStoreLike): IdentityStore {
  return {
    async load() {
      const raw = await secureStore.getItemAsync(IDENTITY_KEY);
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw) as Partial<Identity>;
        if (parsed.user && parsed.workspace) {
          return { user: parsed.user, workspace: parsed.workspace };
        }
        return null;
      } catch {
        return null;
      }
    },
    async save(identity) {
      await secureStore.setItemAsync(IDENTITY_KEY, JSON.stringify(identity));
    },
    async clear() {
      await secureStore.deleteItemAsync(IDENTITY_KEY);
    },
  };
}
