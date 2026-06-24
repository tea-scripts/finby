import { ApiError } from '@finby/core';

export type ChatNotice = {
  kind: 'limit' | 'down' | 'error';
  message: string;
  /** Set on a 429 daily-limit hit that carries `upgradeRequired` (highest-intent upgrade moment). */
  upgrade?: boolean;
};

/** Map a thrown error to a user-facing chat notice (mirrors the web chat). */
export function chatNotice(err: unknown): ChatNotice {
  if (err instanceof ApiError) {
    if (err.status === 429) {
      const upgrade = !!(err.details as { upgradeRequired?: boolean } | undefined)?.upgradeRequired;
      return { kind: 'limit', message: err.message, upgrade };
    }
    if (err.status === 503) return { kind: 'down', message: err.message };
    if (err.status === 401) {
      return { kind: 'error', message: 'Your session expired. Please sign in again.' };
    }
    return { kind: 'error', message: err.message };
  }
  return { kind: 'error', message: 'Something went wrong. Please try again.' };
}
