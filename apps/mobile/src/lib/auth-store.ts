import { createStore, type StoreApi } from 'zustand/vanilla';
import type { ApiUser, ApiWorkspace, RegisterInput } from '@finby/shared';
import type { MobileSession } from './session';
import type { IdentityStore } from '../adapters/identity-store';
import type { OnboardingFlag } from '../adapters/onboarding-flag';
import type { LockPref } from '../adapters/lock-pref';

export interface AuthState {
  user: ApiUser | null;
  workspace: ApiWorkspace | null;
  status: 'loading' | 'idle' | 'authed';
  /** Whether the first-launch onboarding carousel has been shown. */
  onboarded: boolean;
  /** Whether the biometric app-lock preference is enabled. */
  lockEnabled: boolean;
  /** Whether the app is currently locked (awaiting biometric unlock). */
  locked: boolean;
  hydrate(): Promise<void>;
  login(email: string, password: string): Promise<void>;
  register(input: RegisterInput): Promise<void>;
  logout(): Promise<void>;
  completeOnboarding(): Promise<void>;
  /** Clear the onboarding flag so the carousel replays (dev/testing). */
  resetOnboarding(): Promise<void>;
  /** Mark the app unlocked (after a successful biometric prompt). */
  unlock(): void;
  /** Lock the app if the lock is enabled (called on resume-from-background). */
  lockNow(): void;
  /** Persist + apply the lock preference. Disabling also unlocks. */
  setLockEnabled(enabled: boolean): Promise<void>;
}

/** Mobile auth store: identity + status, plus the cold-start restore that the
 *  root navigation gate reads, and the biometric app-lock state the
 *  BiometricGate reads. The session owns tokens (SecureStore); the identity
 *  store owns the restorable user+workspace snapshot. */
export function createAuthStore(deps: {
  session: MobileSession;
  identityStore: IdentityStore;
  onboardingFlag: OnboardingFlag;
  lockPref: LockPref;
}): StoreApi<AuthState> {
  const { session, identityStore, onboardingFlag, lockPref } = deps;

  return createStore<AuthState>((set) => ({
    user: null,
    workspace: null,
    status: 'loading',
    onboarded: false,
    lockEnabled: false,
    locked: false,

    hydrate: async () => {
      const onboarded = await onboardingFlag.wasSeen();
      const hasTokens = await session.hydrate();
      if (!hasTokens) {
        set({ status: 'idle', onboarded, lockEnabled: false, locked: false });
        return;
      }
      const identity = await identityStore.load();
      if (identity) {
        // Restoring an existing session on cold start: lock immediately if the
        // user has the app-lock enabled (they'll unlock via biometrics).
        const lockEnabled = await lockPref.isEnabled();
        set({
          user: identity.user,
          workspace: identity.workspace,
          status: 'authed',
          onboarded,
          lockEnabled,
          locked: lockEnabled,
        });
      } else {
        // Tokens without a cached identity shouldn't normally happen; treat as
        // signed out rather than booting into an app with no user.
        await session.clearSession();
        set({ status: 'idle', onboarded, lockEnabled: false, locked: false });
      }
    },

    login: async (email, password) => {
      const result = await session.login(email, password);
      await identityStore.save({ user: result.user, workspace: result.workspace });
      // An interactive login just authenticated the user — start unlocked.
      const lockEnabled = await lockPref.isEnabled();
      set({ user: result.user, workspace: result.workspace, status: 'authed', lockEnabled, locked: false });
    },

    register: async (input) => {
      const result = await session.register(input);
      await identityStore.save({ user: result.user, workspace: result.workspace });
      const lockEnabled = await lockPref.isEnabled();
      set({ user: result.user, workspace: result.workspace, status: 'authed', lockEnabled, locked: false });
    },

    logout: async () => {
      await session.logout();
      await identityStore.clear();
      set({ user: null, workspace: null, status: 'idle', lockEnabled: false, locked: false });
    },

    completeOnboarding: async () => {
      // Flip first so the navigation gate redirects to login immediately; the
      // SecureStore write persists in the background and shouldn't gate the UI.
      set({ onboarded: true });
      await onboardingFlag.markSeen();
    },

    resetOnboarding: async () => {
      await onboardingFlag.reset();
      set({ onboarded: false });
    },

    unlock: () => set({ locked: false }),

    lockNow: () => set((s) => ({ locked: s.lockEnabled })),

    setLockEnabled: async (enabled) => {
      await lockPref.setEnabled(enabled);
      // Enabling doesn't lock immediately (applies on next launch/resume);
      // disabling unlocks right away.
      set((s) => ({ lockEnabled: enabled, locked: enabled ? s.locked : false }));
    },
  }));
}
