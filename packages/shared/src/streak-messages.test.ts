import { describe, expect, it } from 'vitest';
import { streakBand, streakCelebration } from './streak-messages';

describe('streakBand', () => {
  it('returns the band for the streak length (highest threshold first)', () => {
    expect(streakBand(0)).toContain('Log a transaction to start your streak! 🔥');
    expect(streakBand(1)[0]).toContain('Day one');
    expect(streakBand(7).some((m) => m.includes('week'))).toBe(true);
    expect(streakBand(400).some((m) => m.includes('year'))).toBe(true);
  });
  it('always returns a non-empty list', () => {
    expect(streakBand(-5).length).toBeGreaterThan(0);
  });
});

describe('streakCelebration', () => {
  it('picks a deterministic message with an injected rng', () => {
    const msgs = streakBand(7);
    expect(streakCelebration(7, () => 0)).toBe(msgs[0]);
  });
});
