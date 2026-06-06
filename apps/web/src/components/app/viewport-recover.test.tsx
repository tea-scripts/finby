import { describe, it, expect, vi, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { ViewportRecover } from './viewport-recover';

function mockStandalone(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

afterEach(() => {
  document.documentElement.style.removeProperty('--app-h');
});

describe('ViewportRecover', () => {
  it('standalone: pins --app-h to window.innerHeight', () => {
    mockStandalone(true);
    Object.defineProperty(window, 'innerHeight', { value: 812, configurable: true });

    render(<ViewportRecover />);

    expect(document.documentElement.style.getPropertyValue('--app-h')).toBe('812px');
  });

  it('browser (not standalone): leaves --app-h unset so .h-app falls back to 100dvh', () => {
    mockStandalone(false);

    render(<ViewportRecover />);

    expect(document.documentElement.style.getPropertyValue('--app-h')).toBe('');
  });

  it('re-applies on visibilitychange when the PWA becomes visible again', () => {
    mockStandalone(true);
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });

    render(<ViewportRecover />);
    expect(document.documentElement.style.getPropertyValue('--app-h')).toBe('800px');

    // Simulate returning from the Stripe in-app browser at a corrected height.
    Object.defineProperty(window, 'innerHeight', { value: 844, configurable: true });
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));

    expect(document.documentElement.style.getPropertyValue('--app-h')).toBe('844px');
  });
});
