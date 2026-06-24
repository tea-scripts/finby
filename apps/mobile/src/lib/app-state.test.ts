import { describe, expect, it } from 'vitest';
import { isResumeFromBackground } from './app-state';

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
