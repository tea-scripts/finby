'use client';

import { useInstallPrompt } from '@/lib/use-install-prompt';

/** Dismissible install hint, mobile-only, rendered directly above the bottom
 *  tab-bar. Android/Chrome → one-tap install; iOS Safari → Add-to-Home-Screen
 *  hint. Renders nothing when already installed or dismissed. */
export function InstallBanner() {
  const { visible, isIOS, canInstall, promptInstall, dismiss } = useInstallPrompt();
  if (!visible) return null;

  return (
    <div className="flex items-center gap-3 border-t border-line bg-surface/90 px-4 py-2.5 backdrop-blur md:hidden">
      <p className="flex-1 text-xs text-muted">
        {isIOS ? (
          <>
            Install Finby: tap <span className="text-ink">Share</span> ↑ then{' '}
            <span className="text-ink">Add to Home Screen</span>.
          </>
        ) : (
          <>Add Finby to your home screen for a faster, full-screen experience.</>
        )}
      </p>
      {canInstall && !isIOS && (
        <button
          onClick={promptInstall}
          className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white transition hover:bg-accent-hover"
        >
          Install
        </button>
      )}
      <button
        onClick={dismiss}
        aria-label="Dismiss install banner"
        className="shrink-0 rounded-lg px-2 py-1.5 text-xs text-faint transition hover:text-ink"
      >
        ✕
      </button>
    </div>
  );
}
