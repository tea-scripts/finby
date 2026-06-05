import { describe, it, expect } from 'vitest';
import { detectIOS, computeInstallState } from './install-prompt';

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36';
const DESKTOP =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const IOS_INSTAGRAM =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Instagram 300.0.0';
const IPAD_IOS13 =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';

describe('detectIOS', () => {
  it('true for iPhone Safari', () => expect(detectIOS(IPHONE)).toBe(true));
  it('false for Android', () => expect(detectIOS(ANDROID)).toBe(false));
  it('false for desktop', () => expect(detectIOS(DESKTOP)).toBe(false));
  it('false inside an in-app browser (Instagram)', () =>
    expect(detectIOS(IOS_INSTAGRAM)).toBe(false));
  it('false for empty string (SSR-safe)', () => expect(detectIOS('')).toBe(false));
  it('false for modern iPad reporting a desktop UA (documented limitation)', () =>
    expect(detectIOS(IPAD_IOS13)).toBe(false));
});

describe('computeInstallState', () => {
  const base = { isStandalone: false, canInstall: false, dismissed: false };

  it('hidden when already standalone', () => {
    expect(
      computeInstallState({ ...base, userAgent: IPHONE, isStandalone: true }).visible,
    ).toBe(false);
  });
  it('visible on iOS Safari as a manual hint', () => {
    const s = computeInstallState({ ...base, userAgent: IPHONE });
    expect(s.isIOS).toBe(true);
    expect(s.visible).toBe(true);
  });
  it('visible on Android once beforeinstallprompt is captured', () => {
    const s = computeInstallState({ ...base, userAgent: ANDROID, canInstall: true });
    expect(s.isIOS).toBe(false);
    expect(s.visible).toBe(true);
  });
  it('hidden on Android before any beforeinstallprompt', () => {
    expect(computeInstallState({ ...base, userAgent: ANDROID }).visible).toBe(false);
  });
  it('hidden once dismissed', () => {
    expect(
      computeInstallState({ ...base, userAgent: IPHONE, dismissed: true }).visible,
    ).toBe(false);
  });
  it('hidden on desktop browsers', () => {
    expect(computeInstallState({ ...base, userAgent: DESKTOP }).visible).toBe(false);
  });
});
