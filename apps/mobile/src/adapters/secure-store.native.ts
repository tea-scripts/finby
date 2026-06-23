import * as SecureStore from 'expo-secure-store';
import type { SecureStoreLike } from './token-store';

/** expo-secure-store binding. Verified on device (no Vitest coverage — pure
 *  pass-through to the native module). */
export const secureStore: SecureStoreLike = {
  getItemAsync: (k) => SecureStore.getItemAsync(k),
  setItemAsync: (k, v) => SecureStore.setItemAsync(k, v),
  deleteItemAsync: (k) => SecureStore.deleteItemAsync(k),
};
