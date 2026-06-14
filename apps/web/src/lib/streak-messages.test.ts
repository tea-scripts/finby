import { describe, it, expect } from 'vitest';
import { streakBand, streakCelebration } from './streak-messages';

describe('streak-messages', () => {
  it('returns a start nudge for a zero streak', () => {
    expect(streakBand(0).join(' ')).toMatch(/start/i);
  });

  it('selects a distinct band at each threshold boundary', () => {
    expect(streakBand(1)).not.toEqual(streakBand(0));
    expect(streakBand(2)).not.toEqual(streakBand(1));
    expect(streakBand(7)).not.toEqual(streakBand(6));
    expect(streakBand(14)).not.toEqual(streakBand(13));
    expect(streakBand(30)).not.toEqual(streakBand(29));
    expect(streakBand(60)).not.toEqual(streakBand(59));
    expect(streakBand(100)).not.toEqual(streakBand(99));
    expect(streakBand(365)).not.toEqual(streakBand(364));
  });

  it('every band offers multiple variants', () => {
    for (const s of [0, 1, 2, 7, 14, 30, 60, 100, 365]) {
      expect(streakBand(s).length).toBeGreaterThan(1);
    }
  });

  it('streakCelebration returns a message from the matching band', () => {
    const week = streakBand(7);
    expect(streakCelebration(7, () => 0)).toBe(week[0]);
    expect(streakCelebration(7, () => 0.999)).toBe(week[week.length - 1]);
    expect(week).toContain(streakCelebration(7));
  });
});
