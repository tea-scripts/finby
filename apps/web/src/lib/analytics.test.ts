import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock posthog-js before importing the module under test.
const mockPosthog = vi.hoisted(() => ({
  init: vi.fn(),
  identify: vi.fn(),
  reset: vi.fn(),
  capture: vi.fn(),
}));
vi.mock('posthog-js', () => ({ default: mockPosthog }));

import { sanitizeProps, track, identifyUser, resetAnalytics, capturePageview } from './analytics';

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('sanitizeProps', () => {
  it('drops financial/PII keys (case-insensitive), keeps the rest', () => {
    const out = sanitizeProps({ amount: '5', Balance: '9', merchant: 'KFC', tier: 'PRO', currency: 'USD' });
    expect(out).toEqual({ tier: 'PRO', currency: 'USD' });
  });
  it('returns {} for undefined', () => {
    expect(sanitizeProps()).toEqual({});
  });
});

describe('analytics no-op without a key', () => {
  it('track/identify/reset do nothing when NEXT_PUBLIC_POSTHOG_KEY is unset', () => {
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', '');
    track('chat_message_sent');
    identifyUser('u1', 'PRO');
    resetAnalytics();
    expect(mockPosthog.capture).not.toHaveBeenCalled();
    expect(mockPosthog.identify).not.toHaveBeenCalled();
    expect(mockPosthog.reset).not.toHaveBeenCalled();
  });
});

describe('analytics active with a key', () => {
  it('track sanitizes props; identify sends only { tier }', () => {
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', 'phc_test');
    track('transaction_logged', { tx_type: 'EXPENSE', currency: 'USD', amount: '5' });
    expect(mockPosthog.capture).toHaveBeenCalledWith('transaction_logged', { tx_type: 'EXPENSE', currency: 'USD' });

    identifyUser('user-1', 'PRO');
    expect(mockPosthog.identify).toHaveBeenCalledWith('user-1', { tier: 'PRO' });
  });

  it('capturePageview sends a $pageview with $current_url', () => {
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', 'phc_test');
    capturePageview('https://app.finby.app/chat');
    expect(mockPosthog.capture).toHaveBeenCalledWith('$pageview', { $current_url: 'https://app.finby.app/chat' });
  });
});
