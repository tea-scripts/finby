'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  computeInstallState,
  type BeforeInstallPromptEvent,
  type InstallState,
} from './install-prompt';

const DISMISS_KEY = 'finby_install_dismissed';

/** Wires browser APIs (beforeinstallprompt, display-mode, navigator) to the
 *  pure computeInstallState. Initial state is "hidden" until the effect runs,
 *  so the banner never flashes during hydration. */
export function useInstallPrompt(): InstallState & {
  promptInstall: () => Promise<void>;
  dismiss: () => void;
} {
  const [evt, setEvt] = useState<BeforeInstallPromptEvent | null>(null);
  const [userAgent, setUserAgent] = useState('');
  const [dismissed, setDismissed] = useState(true);
  const [isStandalone, setIsStandalone] = useState(true);

  useEffect(() => {
    setUserAgent(navigator.userAgent);
    setDismissed(localStorage.getItem(DISMISS_KEY) === '1');
    setIsStandalone(
      window.matchMedia('(display-mode: standalone)').matches ||
        (navigator as unknown as { standalone?: boolean }).standalone === true,
    );

    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setEvt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    return () =>
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
  }, []);

  const dismiss = useCallback(() => {
    localStorage.setItem(DISMISS_KEY, '1');
    setDismissed(true);
  }, []);

  const promptInstall = useCallback(async () => {
    if (!evt) return;
    await evt.prompt();
    await evt.userChoice;
    setEvt(null);
    dismiss();
  }, [evt, dismiss]);

  const state = computeInstallState({
    userAgent,
    isStandalone,
    canInstall: evt !== null,
    dismissed,
  });

  return { ...state, promptInstall, dismiss };
}
