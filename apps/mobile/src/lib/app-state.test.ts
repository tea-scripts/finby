import { describe, expect, it } from 'vitest';
import { isResumeFromBackground, shouldRelockOnResume } from './app-state';

describe('isResumeFromBackground', () => {
  it('is true for a real background → active resume', () => {
    expect(isResumeFromBackground('background', 'active')).toBe(true);
  });

  it('is FALSE for inactive → active (the OS auth dialog — must not re-lock)', () => {
    expect(isResumeFromBackground('inactive', 'active')).toBe(false);
  });

  it('is false when not returning to active', () => {
    expect(isResumeFromBackground('active', 'background')).toBe(false);
    expect(isResumeFromBackground('active', 'inactive')).toBe(false);
  });

  it('is false for active → active', () => {
    expect(isResumeFromBackground('active', 'active')).toBe(false);
  });
});

describe('shouldRelockOnResume', () => {
  const GRACE = 60_000;

  it('re-locks when backgrounded past the grace period', () => {
    expect(shouldRelockOnResume('background', 'active', 1_000, 1_000 + GRACE, GRACE)).toBe(true);
    expect(shouldRelockOnResume('background', 'active', 1_000, 1_000 + GRACE + 5_000, GRACE)).toBe(true);
  });

  it('does NOT re-lock for a quick peek within the grace period', () => {
    expect(shouldRelockOnResume('background', 'active', 1_000, 1_000 + 3_000, GRACE)).toBe(false);
  });

  it('does NOT re-lock for inactive → active (OS auth dialog / notification pull)', () => {
    expect(shouldRelockOnResume('inactive', 'active', 1_000, 1_000 + GRACE + 9_999, GRACE)).toBe(false);
  });

  it('does NOT re-lock when there is no recorded background time', () => {
    expect(shouldRelockOnResume('background', 'active', null, 9_999_999, GRACE)).toBe(false);
  });
});
