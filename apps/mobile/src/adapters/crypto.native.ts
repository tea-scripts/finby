import * as Crypto from 'expo-crypto';
import type { PinHasher } from './lock-code';

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** expo-crypto binding for the lock-code PIN hashing (SHA-256 + random salt).
 *  Verified on device (no Vitest coverage — pure pass-through to the module). */
export const pinHasher: PinHasher = {
  digest: (data) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, data),
  randomSalt: async () => toHex(await Crypto.getRandomBytesAsync(16)),
};
