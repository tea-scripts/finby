/** Bundled Lottie animations available to announcements. The JSON files ship in
 *  apps/web/public/lottie/. Admins pick by `key`; new artwork is a dev task
 *  (drop the .json in public/lottie/ + add one entry here). */
export interface LottieAsset {
  key: string;
  label: string;
  path: string;
}

export const LOTTIE_REGISTRY: readonly LottieAsset[] = [
  { key: 'streak-flame', label: 'Streak flame', path: '/lottie/streak-flame.json' },
  { key: 'notif-bell', label: 'Notification bell', path: '/lottie/notif-bell.json' },
  { key: 'receipt-scan', label: 'Receipt scan', path: '/lottie/receipt-scan.json' },
  { key: 'account-cards', label: 'Account cards', path: '/lottie/account-cards.json' },
] as const;

export const LOTTIE_KEYS: readonly string[] = LOTTIE_REGISTRY.map((a) => a.key);

/** Resolve a registry key to its public path, or null if unknown/absent. */
export function lottiePathForKey(key: string | null | undefined): string | null {
  if (!key) return null;
  return LOTTIE_REGISTRY.find((a) => a.key === key)?.path ?? null;
}
