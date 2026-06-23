import { describe, expect, it } from 'vitest';
import { nextRoute } from './auth-gate-route';

describe('nextRoute', () => {
  it('loading + any segments → null', () => {
    expect(nextRoute({ status: 'loading', onboarded: true, segments: [] })).toBeNull();
    expect(nextRoute({ status: 'loading', onboarded: false, segments: ['(auth)', 'login'] })).toBeNull();
    expect(nextRoute({ status: 'loading', onboarded: true, segments: ['(app)'] })).toBeNull();
  });

  it('authed + ["(app)"] → null (already home)', () => {
    expect(nextRoute({ status: 'authed', onboarded: true, segments: ['(app)'] })).toBeNull();
  });

  it('authed + [] (root/limbo cold-start) → "/(app)"', () => {
    expect(nextRoute({ status: 'authed', onboarded: true, segments: [] })).toBe('/(app)');
  });

  it('authed + ["(auth)","login"] → "/(app)"', () => {
    expect(nextRoute({ status: 'authed', onboarded: true, segments: ['(auth)', 'login'] })).toBe('/(app)');
  });

  it('signed out (idle) + NOT onboarded + [] → "/(auth)/onboarding"', () => {
    expect(nextRoute({ status: 'idle', onboarded: false, segments: [] })).toBe('/(auth)/onboarding');
  });

  it('signed out + NOT onboarded + ["(auth)","onboarding"] → null', () => {
    expect(nextRoute({ status: 'idle', onboarded: false, segments: ['(auth)', 'onboarding'] })).toBeNull();
  });

  it('signed out + onboarded + ["(app)"] → "/(auth)/login"', () => {
    expect(nextRoute({ status: 'idle', onboarded: true, segments: ['(app)'] })).toBe('/(auth)/login');
  });

  it('signed out + onboarded + ["(auth)","login"] → null', () => {
    expect(nextRoute({ status: 'idle', onboarded: true, segments: ['(auth)', 'login'] })).toBeNull();
  });
});
