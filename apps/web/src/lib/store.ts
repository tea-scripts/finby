import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { DEFAULT_PREFERENCES } from '@finby/shared';
import { ApiError, apiFetch } from './api-client';
import type {
  ApiUser,
  ApiWorkspace,
  AuthResult,
  RegisterInput,
  TokenPair,
} from './types';

/**
 * Normalize a user from the API/persisted state so consumers can always rely
 * on `preferences` being present (older sessions predate this field).
 */
function normalizeUser(user: ApiUser): ApiUser {
  return { ...user, preferences: user.preferences ?? DEFAULT_PREFERENCES };
}

/**
 * Auth store: holds tokens + identity, persisted to localStorage.
 * `authed()` is the one helper every feature should use for protected
 * requests — it attaches the bearer token and transparently refreshes once
 * on a 401. api-client.ts must never import this module (no cycle).
 */
interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: ApiUser | null;
  workspace: ApiWorkspace | null;
  status: 'idle' | 'authed';

  register: (input: RegisterInput) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  tryRefresh: () => Promise<boolean>;
  authed: <T>(path: string, init?: RequestInit) => Promise<T>;
  markVerified: () => void;
  refreshUser: () => Promise<void>;
  setWorkspaceTier: (tier: import('./types').SubscriptionTier) => void;
  setUser: (patch: Partial<ApiUser>) => void;
  setPreferredCurrencies: (codes: string[]) => void;
}

const CLEARED = {
  accessToken: null,
  refreshToken: null,
  user: null,
  workspace: null,
  status: 'idle' as const,
};

export const useAuth = create<AuthState>()(
  persist(
    (set, get) => ({
      ...CLEARED,

      register: async (input) => {
        const result = await apiFetch<AuthResult>('/auth/register', {
          method: 'POST',
          body: JSON.stringify(input),
        });
        set({
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
          user: normalizeUser(result.user),
          workspace: result.workspace,
          status: 'authed',
        });
      },

      login: async (email, password) => {
        const result = await apiFetch<AuthResult>('/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email, password }),
        });
        set({
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
          user: normalizeUser(result.user),
          workspace: result.workspace,
          status: 'authed',
        });
      },

      logout: async () => {
        const { refreshToken } = get();
        if (refreshToken) {
          // Best-effort server-side revocation; never block local sign-out on it.
          try {
            await apiFetch<void>('/auth/logout', {
              method: 'POST',
              body: JSON.stringify({ refreshToken }),
            });
          } catch {
            /* ignore — clearing local state below is what matters */
          }
        }
        set({ ...CLEARED });
      },

      tryRefresh: async () => {
        const { refreshToken } = get();
        if (!refreshToken) return false;
        try {
          const pair = await apiFetch<TokenPair>('/auth/refresh', {
            method: 'POST',
            body: JSON.stringify({ refreshToken }),
          });
          set({
            accessToken: pair.accessToken,
            refreshToken: pair.refreshToken,
          });
          return true;
        } catch {
          // Refresh token is dead — drop straight to a clean signed-out state.
          // (Don't call logout(): its revoke call would just 401 on the bad token.)
          set({ ...CLEARED });
          return false;
        }
      },

      markVerified: () => {
        const u = get().user;
        if (u) set({ user: { ...u, emailVerified: true } });
      },

      refreshUser: async () => {
        try {
          const { user } = await get().authed<{ user: ApiUser }>('/auth/me');
          set({ user: normalizeUser(user) });
        } catch {
          /* ignore — keep the current user */
        }
      },

      setWorkspaceTier: (tier) => {
        const ws = get().workspace;
        if (ws) set({ workspace: { ...ws, tier } });
      },

      setUser: (patch) => {
        set((s) => (s.user ? { user: { ...s.user, ...patch } } : {}));
      },

      setPreferredCurrencies: (codes) => {
        set((s) =>
          s.workspace
            ? { workspace: { ...s.workspace, preferredCurrencies: codes } }
            : {},
        );
      },

      authed: async <T>(path: string, init: RequestInit = {}): Promise<T> => {
        const withToken = (token: string | null): RequestInit => ({
          ...init,
          headers: {
            ...(init.headers ?? {}),
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });

        try {
          return await apiFetch<T>(path, withToken(get().accessToken));
        } catch (err) {
          if (
            err instanceof ApiError &&
            err.status === 401 &&
            get().refreshToken
          ) {
            const refreshed = await get().tryRefresh();
            if (refreshed) {
              return await apiFetch<T>(path, withToken(get().accessToken));
            }
          }
          throw err;
        }
      },
    }),
    {
      name: 'finby-auth',
      storage: createJSONStorage(() => localStorage),
      // Persist only serializable identity/token fields, never the actions.
      partialize: (s) => ({
        accessToken: s.accessToken,
        refreshToken: s.refreshToken,
        user: s.user,
        workspace: s.workspace,
        status: s.status,
      }),
    },
  ),
);
