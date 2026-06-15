import { describe, it, expect } from 'vitest';
import { shouldPromptStreakStart } from './streak-start';

describe('shouldPromptStreakStart', () => {
  it('prompts on the first streak day when push is off and not yet shown', () => {
    expect(shouldPromptStreakStart(1, 'off', false)).toBe(true);
  });

  it('does not prompt past day 1', () => {
    expect(shouldPromptStreakStart(2, 'off', false)).toBe(false);
  });

  it('does not prompt when already shown once', () => {
    expect(shouldPromptStreakStart(1, 'off', true)).toBe(false);
  });

  it('does not prompt when push is already on', () => {
    expect(shouldPromptStreakStart(1, 'on', false)).toBe(false);
  });

  it('still prompts when push was denied (iOS install path can help)', () => {
    expect(shouldPromptStreakStart(1, 'denied', false)).toBe(true);
  });
});
