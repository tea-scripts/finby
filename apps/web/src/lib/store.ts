import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { DEFAULT_PREFERENCES } from '@finby/shared';
import { API_BASE, apiFetch } from './api-client';
import { createAuthedClient } from '@finby/core';
import { identifyUser, resetAnalytics, track } from './analytics';
import type {
  ApiUser,
  ApiWorkspace,
  AuthResult,
  RegisterInput,
  WorkspaceMembershipSummary,
} from './types';

/**
 * Normalize a user from the API/persisted state so consumers can always rely
 * on `preferences` and streak counts being present (older sessions predate
 * these fields).
 */
function normalizeUser(user: ApiUser): ApiUser {
  return {
    ...user,
    preferences: user.preferences ?? DEFAULT_PREFERENCES,
    currentStreak: user.currentStreak ?? 0,
    longestStreak: user.longestStreak ?? 0,
  };
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
  authedStream: (path: string, init?: RequestInit) => Promise<Response>;
  markVerified: () => void;
  refreshUser: () => Promise<void>;
  workspaces: WorkspaceMembershipSummary[];
  activeWorkspaceId: string | null;
  fetchWorkspaces: () => Promise<void>;
  setActiveWorkspace: (id: string) => void;
  setWorkspaceTier: (tier: import('./types').SubscriptionTier) => void;
  setUser: (patch: Partial<ApiUser>) => void;
  setPreferredCurrencies: (codes: string[]) => void;
  setBaseCurrency: (baseCurrency: string, preferredCurrencies: string[]) => void;
}

const CLEARED = {
  accessToken: null,
  refreshToken: null,
  user: null,
  workspace: null,
  status: 'idle' as const,
  workspaces: [] as WorkspaceMembershipSummary[],
  activeWorkspaceId: null as string | null,
};

export const useAuth = create<AuthState>()(
  persist(
    (set, get) => {
      const authedClient = createAuthedClient({
        http: { baseUrl: API_BASE, apiFetch },
        getAccessToken: () => get().accessToken,
        getRefreshToken: () => get().refreshToken,
        setTokens: (pair) => set({ accessToken: pair.accessToken, refreshToken: pair.refreshToken }),
        onAuthCleared: () => set({ ...CLEARED }),
      });

      return {
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
          activeWorkspaceId: result.workspace.id,
        });
        identifyUser(result.user.id, result.workspace.tier);
        track('signed_up', { method: 'password' });
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
          activeWorkspaceId: result.workspace.id,
        });
        identifyUser(result.user.id, result.workspace.tier);
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
        resetAnalytics();
      },

      tryRefresh: () => authedClient.tryRefresh(),

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
        const { workspace, user } = get();
        if (workspace) set({ workspace: { ...workspace, tier } });
        if (user) identifyUser(user.id, tier);
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

      setBaseCurrency: (baseCurrency, preferredCurrencies) => {
        set((s) => {
          if (!s.workspace) return {};
          const id = s.workspace.id;
          return {
            workspace: { ...s.workspace, baseCurrency, preferredCurrencies },
            // Keep the cached membership list in sync so switching workspace
            // and back doesn't resurrect the old base currency.
            workspaces: s.workspaces.map((w) =>
              w.workspaceId === id ? { ...w, baseCurrency } : w,
            ),
          };
        });
      },

      fetchWorkspaces: async () => {
        try {
          const list = await get().authed<WorkspaceMembershipSummary[]>('/auth/workspaces');
          set({ workspaces: list });
        } catch {
          /* ignore — keep current list */
        }
      },

      setActiveWorkspace: (id) => {
        const target = get().workspaces.find((w) => w.workspaceId === id);
        if (!target) return;
        const current = get().workspace;
        set({
          activeWorkspaceId: id,
          workspace: {
            ...(current ?? ({} as ApiWorkspace)),
            id: target.workspaceId,
            name: target.name,
            slug: target.slug,
            tier: target.tier,
            baseCurrency: target.baseCurrency,
            preferredCurrencies: current?.id === id ? (current?.preferredCurrencies ?? []) : [],
          } as ApiWorkspace,
        });
        const u = get().user;
        if (u) identifyUser(u.id, target.tier);
      },

      authed: <T>(path: string, init?: RequestInit): Promise<T> => authedClient.authed<T>(path, init),

      authedStream: (path, init) => authedClient.authedStream(path, init),
      };
    },
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
        workspaces: s.workspaces,
        activeWorkspaceId: s.activeWorkspaceId,
      }),
    },
  ),
);
