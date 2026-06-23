import Constants from 'expo-constants';
import { resolveApiBase } from '../config';
import { createTokenStore } from '../adapters/token-store';
import { secureStore } from '../adapters/secure-store.native';
import { streamFetch } from '../adapters/stream.native';
import { createMobileSession } from './session';
import { createMobileApi } from './api';

const apiBase = resolveApiBase({
  envUrl: process.env.EXPO_PUBLIC_API_URL,
  extraApiBase: (Constants.expoConfig?.extra as { apiBase?: unknown } | undefined)?.apiBase,
});

/** App-wide session (SecureStore tokens + expo/fetch streaming) and the
 *  core-bound api. Screens import these. Call `session.hydrate()` once at
 *  startup to restore a persisted login. */
export const session = createMobileSession({
  apiBase,
  tokenStore: createTokenStore(secureStore),
  fetchImpl: streamFetch,
});

export const api = createMobileApi(session, apiBase);
