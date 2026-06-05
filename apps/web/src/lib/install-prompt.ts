/** Chromium-only beforeinstallprompt event (not in lib.dom). */
export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export interface InstallEnv {
  userAgent: string;
  isStandalone: boolean;
  canInstall: boolean; // a beforeinstallprompt event was captured
  dismissed: boolean;
}

export interface InstallState {
  isIOS: boolean;
  isStandalone: boolean;
  canInstall: boolean;
  visible: boolean;
}

/** iOS Safari (iPhone/iPad/iPod), by user-agent only. Excludes in-app browsers
 *  (Facebook, Instagram, LINE) where "Add to Home Screen" is unavailable.
 *  Returns false for an empty string (safe during SSR / first render).
 *  Known limitation: iPadOS 13+ reports a desktop (Mac) UA by default, so a
 *  modern iPad is intentionally NOT detected here — a pure user-agent module
 *  cannot distinguish it from macOS Safari. (A consumer could refine this via
 *  navigator.maxTouchPoints if iPad coverage ever matters.) */
export function detectIOS(userAgent: string): boolean {
  const ua = userAgent.toLowerCase();
  const isAppleMobile = /iphone|ipad|ipod/.test(ua);
  const inAppBrowser = /fb(an|av)|instagram|line\//.test(ua);
  return isAppleMobile && !inAppBrowser;
}

/** Should the install banner show? Never in standalone (already installed);
 *  shown when we can prompt (Android) or on iOS (manual hint), unless the user
 *  has dismissed it. */
export function computeInstallState(env: InstallEnv): InstallState {
  const isIOS = detectIOS(env.userAgent);
  const visible =
    !env.isStandalone && !env.dismissed && (env.canInstall || isIOS);
  return { isIOS, isStandalone: env.isStandalone, canInstall: env.canInstall, visible };
}
