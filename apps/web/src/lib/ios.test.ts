import { describe, it, expect } from 'vitest';
import { isIosSafariTab } from './ios';

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const ANDROID =
  'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36';

describe('isIosSafariTab', () => {
  it('is true for an iPhone UA that is not standalone', () => {
    expect(isIosSafariTab(IPHONE, false)).toBe(true);
  });
  it('is false for an installed (standalone) iPhone PWA', () => {
    expect(isIosSafariTab(IPHONE, true)).toBe(false);
  });
  it('is false for non-iOS devices', () => {
    expect(isIosSafariTab(ANDROID, false)).toBe(false);
  });
});
