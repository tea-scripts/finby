import { describe, expect, it, vi } from 'vitest';
import { createAnalytics, sanitizeProps } from './analytics';

const DENY = ['amount', 'balance', 'email'];

describe('sanitizeProps', () => {
  it('drops deny-listed keys (case-insensitive)', () => {
    expect(sanitizeProps({ tier: 'PRO', Amount: 5, email: 'x@y.z' }, DENY)).toEqual({ tier: 'PRO' });
  });
  it('returns {} for undefined', () => {
    expect(sanitizeProps(undefined, DENY)).toEqual({});
  });
});

describe('createAnalytics', () => {
  it('no-ops safely when client is null', () => {
    const a = createAnalytics(null, DENY);
    expect(() => { a.track('signed_up'); a.identifyUser('u1', 'PRO'); a.resetAnalytics(); }).not.toThrow();
  });
  it('forwards sanitized props to capture', () => {
    const client = { capture: vi.fn(), identify: vi.fn(), reset: vi.fn() };
    createAnalytics(client, DENY).track('transaction_logged', { tier: 'PRO', amount: 9 });
    expect(client.capture).toHaveBeenCalledWith('transaction_logged', { tier: 'PRO' });
  });
  it('identify forwards the tier; never throws if the client throws', () => {
    const client = { capture: () => {}, identify: vi.fn(() => { throw new Error('boom'); }), reset: () => {} };
    expect(() => createAnalytics(client, DENY).identifyUser('u1', 'PRO')).not.toThrow();
    expect(client.identify).toHaveBeenCalledWith('u1', { tier: 'PRO' });
  });
});
