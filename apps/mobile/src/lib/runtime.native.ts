import Constants from 'expo-constants';
import { resolveApiBase } from '../config';
import { createTokenStore } from '../adapters/token-store';
import { createIdentityStore } from '../adapters/identity-store';
import { createOnboardingFlag } from '../adapters/onboarding-flag';
import { createLockPref } from '../adapters/lock-pref';
import { createLockCode } from '../adapters/lock-code';
import { pinHasher } from '../adapters/crypto.native';
import { createBiometric } from '../adapters/biometric';
import { localAuth } from '../adapters/local-auth.native';
import { secureStore } from '../adapters/secure-store.native';
import { streamFetch } from '../adapters/stream.native';
import { createMobileSession } from './session';
import { createAuthStore } from './auth-store';
import { createMobileApi } from './api';

const apiBase = resolveApiBase({
  envUrl: process.env.EXPO_PUBLIC_API_URL,
  extraApiBase: (Constants.expoConfig?.extra as { apiBase?: unknown } | undefined)?.apiBase,
});

/** App-wide session (SecureStore tokens + expo/fetch streaming) and the
 *  core-bound api. The root gate calls `authStore.getState().hydrate()` once
 *  at startup to restore a persisted login. */
export const session = createMobileSession({
  apiBase,
  tokenStore: createTokenStore(secureStore),
  fetchImpl: streamFetch,
});

export const authStore = createAuthStore({
  session,
  identityStore: createIdentityStore(secureStore),
  onboardingFlag: createOnboardingFlag(secureStore),
  lockPref: createLockPref(secureStore),
  lockCode: createLockCode(secureStore, pinHasher),
});

/** Biometric app-lock (Face ID / Touch ID / passcode fallback). Read by the
 *  UnlockScreen behind the AppLockGate that wraps the (app) group. */
export const biometric = createBiometric(localAuth);

export const api = createMobileApi(session, apiBase);
