import { createStore, type StoreApi } from 'zustand/vanilla';
import type { ApiUser, ApiWorkspace, RegisterInput } from '@finby/shared';
import type { MobileSession } from './session';
import type { IdentityStore } from '../adapters/identity-store';
import type { OnboardingFlag } from '../adapters/onboarding-flag';

export interface AuthState {
  user: ApiUser | null;
  workspace: ApiWorkspace | null;
  status: 'loading' | 'idle' | 'authed';
  /** Whether the first-launch onboarding carousel has been shown. */
  onboarded: boolean;
  hydrate(): Promise<void>;
  login(email: string, password: string): Promise<void>;
  register(input: RegisterInput): Promise<void>;
  logout(): Promise<void>;
  completeOnboarding(): Promise<void>;
}

/** Mobile auth store: identity + status, plus the cold-start restore that the
 *  root navigation gate reads. The session owns tokens (SecureStore); the
 *  identity store owns the restorable user+workspace snapshot. */
export function createAuthStore(deps: {
  session: MobileSession;
  identityStore: IdentityStore;
  onboardingFlag: OnboardingFlag;
}): StoreApi<AuthState> {
  const { session, identityStore, onboardingFlag } = deps;

  return createStore<AuthState>((set) => ({
    user: null,
    workspace: null,
    status: 'loading',
    onboarded: false,

    hydrate: async () => {
      const onboarded = await onboardingFlag.wasSeen();
      const hasTokens = await session.hydrate();
      if (!hasTokens) {
        set({ status: 'idle', onboarded });
        return;
      }
      const identity = await identityStore.load();
      if (identity) {
        set({ user: identity.user, workspace: identity.workspace, status: 'authed', onboarded });
      } else {
        // Tokens without a cached identity shouldn't normally happen; treat as
        // signed out rather than booting into an app with no user.
        await session.clearSession();
        set({ status: 'idle', onboarded });
      }
    },

    login: async (email, password) => {
      const result = await session.login(email, password);
      await identityStore.save({ user: result.user, workspace: result.workspace });
      set({ user: result.user, workspace: result.workspace, status: 'authed' });
    },

    register: async (input) => {
      const result = await session.register(input);
      await identityStore.save({ user: result.user, workspace: result.workspace });
      set({ user: result.user, workspace: result.workspace, status: 'authed' });
    },

    logout: async () => {
      await session.logout();
      await identityStore.clear();
      set({ user: null, workspace: null, status: 'idle' });
    },

    completeOnboarding: async () => {
      await onboardingFlag.markSeen();
      set({ onboarded: true });
    },
  }));
}
