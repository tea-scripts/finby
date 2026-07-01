import { createStore, type StoreApi } from 'zustand/vanilla';
import type { ApiUser, ApiWorkspace, RegisterInput } from '@finby/shared';
import type { MobileSession } from './session';
import type { IdentityStore } from '../adapters/identity-store';
import type { OnboardingFlag } from '../adapters/onboarding-flag';
import type { LockPref } from '../adapters/lock-pref';
import type { LockCode } from '../adapters/lock-code';

export interface AuthState {
  user: ApiUser | null;
  workspace: ApiWorkspace | null;
  status: 'loading' | 'idle' | 'authed';
  /** Whether the first-launch onboarding carousel has been shown. */
  onboarded: boolean;
  /** Whether the biometric/PIN app-lock preference is enabled. */
  lockEnabled: boolean;
  /** Whether an unlock PIN has been set. */
  hasPin: boolean;
  /** Whether the app is currently locked (awaiting biometric/PIN unlock). */
  locked: boolean;
  hydrate(): Promise<void>;
  login(email: string, password: string): Promise<void>;
  register(input: RegisterInput): Promise<void>;
  logout(): Promise<void>;
  completeOnboarding(): Promise<void>;
  /** Clear the onboarding flag so the carousel replays (dev/testing). */
  resetOnboarding(): Promise<void>;
  /** Mark the app unlocked (after a successful biometric/PIN entry). */
  unlock(): void;
  /** Lock the app if the lock is enabled (called on resume-from-background). */
  lockNow(): void;
  /** Persist + apply the lock preference. Disabling also unlocks. */
  setLockEnabled(enabled: boolean): Promise<void>;
  /** Set the unlock PIN (first-login setup). */
  setPin(pin: string): Promise<void>;
  /** Check an entered PIN against the stored one. */
  verifyPin(pin: string): Promise<boolean>;
  /** Update the cached user's streak counters (after a repair) so the badge reflects it. */
  setStreak(currentStreak: number, longestStreak: number): void;
  /** Merge a patch into the cached user and persist the identity snapshot. */
  setUser(patch: Partial<ApiUser>): void;
  /** Merge a patch into the cached workspace and persist the identity snapshot. */
  setWorkspace(patch: Partial<ApiWorkspace>): void;
}

/** Mobile auth store: identity + status, plus the cold-start restore that the
 *  root navigation gate reads, and the biometric/PIN app-lock state the
 *  AppLockGate reads. The session owns tokens (SecureStore); the identity store
 *  owns the restorable user+workspace snapshot. */
export function createAuthStore(deps: {
  session: MobileSession;
  identityStore: IdentityStore;
  onboardingFlag: OnboardingFlag;
  lockPref: LockPref;
  lockCode: LockCode;
}): StoreApi<AuthState> {
  const { session, identityStore, onboardingFlag, lockPref, lockCode } = deps;

  return createStore<AuthState>((set, get) => ({
    user: null,
    workspace: null,
    status: 'loading',
    onboarded: false,
    lockEnabled: false,
    hasPin: false,
    locked: false,

    hydrate: async () => {
      const onboarded = await onboardingFlag.wasSeen();
      const hasTokens = await session.hydrate();
      if (!hasTokens) {
        set({ status: 'idle', onboarded, lockEnabled: false, hasPin: false, locked: false });
        return;
      }
      const identity = await identityStore.load();
      if (identity) {
        // Restoring a session on cold start: lock if the lock is on AND a PIN
        // exists (the gate sends users without a PIN to set one first).
        const lockEnabled = await lockPref.isEnabled();
        const hasPin = await lockCode.isSet();
        set({
          user: identity.user,
          workspace: identity.workspace,
          status: 'authed',
          onboarded,
          lockEnabled,
          hasPin,
          locked: lockEnabled && hasPin,
        });
      } else {
        await session.clearSession();
        set({ status: 'idle', onboarded, lockEnabled: false, hasPin: false, locked: false });
      }
    },

    login: async (email, password) => {
      const result = await session.login(email, password);
      await identityStore.save({ user: result.user, workspace: result.workspace });
      const lockEnabled = await lockPref.isEnabled();
      const hasPin = await lockCode.isSet();
      set({ user: result.user, workspace: result.workspace, status: 'authed', lockEnabled, hasPin, locked: false });
    },

    register: async (input) => {
      const result = await session.register(input);
      await identityStore.save({ user: result.user, workspace: result.workspace });
      const lockEnabled = await lockPref.isEnabled();
      const hasPin = await lockCode.isSet();
      set({ user: result.user, workspace: result.workspace, status: 'authed', lockEnabled, hasPin, locked: false });
    },

    logout: async () => {
      await session.logout();
      await identityStore.clear();
      set({ user: null, workspace: null, status: 'idle', lockEnabled: false, hasPin: false, locked: false });
    },

    completeOnboarding: async () => {
      set({ onboarded: true });
      await onboardingFlag.markSeen();
    },

    resetOnboarding: async () => {
      await onboardingFlag.reset();
      set({ onboarded: false });
    },

    unlock: () => set({ locked: false }),

    lockNow: () => set((s) => ({ locked: s.lockEnabled && s.hasPin })),

    setLockEnabled: async (enabled) => {
      await lockPref.setEnabled(enabled);
      set((s) => ({ lockEnabled: enabled, locked: enabled ? s.locked : false }));
    },

    setPin: async (pin) => {
      await lockCode.set(pin);
      set({ hasPin: true });
    },

    verifyPin: (pin) => lockCode.verify(pin),

    setStreak: (currentStreak, longestStreak) =>
      set((s) => (s.user ? { user: { ...s.user, currentStreak, longestStreak } } : {})),

    setUser: (patch) => {
      set((s) => (s.user ? { user: { ...s.user, ...patch } } : {}));
      const { user, workspace } = get();
      if (user && workspace) void identityStore.save({ user, workspace });
    },

    setWorkspace: (patch) => {
      set((s) => (s.workspace ? { workspace: { ...s.workspace, ...patch } } : {}));
      const { user, workspace } = get();
      if (user && workspace) void identityStore.save({ user, workspace });
    },
  }));
}
