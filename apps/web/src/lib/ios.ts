/** True when running in an iOS Safari browser tab that is NOT an installed PWA.
 *  Web Push is unavailable here — the user must Add to Home Screen first.
 *  Pure inputs so it is unit-testable; call sites pass live values. */
export function isIosSafariTab(userAgent: string, standalone: boolean): boolean {
  const isIos = /iPad|iPhone|iPod/.test(userAgent);
  return isIos && !standalone;
}

/** Browser-evaluated convenience wrapper. */
export function detectIosSafariTab(): boolean {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return false;
  const standalone =
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true;
  return isIosSafariTab(navigator.userAgent, Boolean(standalone));
}
