import { createStore, type StoreApi } from 'zustand/vanilla';
import type { ApiUser, ApiWorkspace, RegisterInput } from '@finby/shared';
import type { MobileSession } from './session';

export interface AuthState {
  user: ApiUser | null;
  workspace: ApiWorkspace | null;
  status: 'idle' | 'authed';
  login(email: string, password: string): Promise<void>;
  register(input: RegisterInput): Promise<void>;
  logout(): Promise<void>;
}

/** Mobile auth store. Holds identity + status; drives the session for the
 *  network/token side. Cold-start session restore (hydrate + identity
 *  persistence + navigation gate) is added in Phase 3b. */
export function createAuthStore(session: MobileSession): StoreApi<AuthState> {
  return createStore<AuthState>((set) => ({
    user: null,
    workspace: null,
    status: 'idle',

    login: async (email, password) => {
      const result = await session.login(email, password);
      set({ user: result.user, workspace: result.workspace, status: 'authed' });
    },
    register: async (input) => {
      const result = await session.register(input);
      set({ user: result.user, workspace: result.workspace, status: 'authed' });
    },
    logout: async () => {
      await session.logout();
      set({ user: null, workspace: null, status: 'idle' });
    },
  }));
}
