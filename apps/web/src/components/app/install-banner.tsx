'use client';

import { useState } from 'react';
import { InstallSheet } from '@/components/app/install-sheet';
import { useInstallPrompt } from '@/lib/use-install-prompt';

/** Dismissible install affordance, mobile-only, rendered directly above the
 *  bottom tab-bar. Android/Chrome → one-tap native install; iOS Safari →
 *  "Install app" opens a guided Add-to-Home-Screen sheet (Apple allows no
 *  programmatic install). Renders nothing when already installed or dismissed. */
export function InstallBanner() {
  const { visible, isIOS, canInstall, promptInstall, dismiss } = useInstallPrompt();
  const [sheetOpen, setSheetOpen] = useState(false);
  if (!visible) return null;

  return (
    <>
      <div className="flex items-center gap-3 border-t border-line bg-surface/90 px-4 py-2.5 backdrop-blur md:hidden">
        <p className="flex-1 text-xs text-muted">
          Add Finby to your home screen for a faster, full-screen experience.
        </p>
        {isIOS ? (
          <button
            onClick={() => setSheetOpen(true)}
            className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white transition hover:bg-accent-hover"
          >
            Install app
          </button>
        ) : (
          canInstall && (
            <button
              onClick={promptInstall}
              className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white transition hover:bg-accent-hover"
            >
              Install
            </button>
          )
        )}
        <button
          onClick={dismiss}
          aria-label="Dismiss install banner"
          className="shrink-0 rounded-lg px-2 py-1.5 text-xs text-faint transition hover:text-ink"
        >
          ✕
        </button>
      </div>
      <InstallSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
    </>
  );
}
