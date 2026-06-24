import { describe, expect, it } from 'vitest';
import { revealStep } from './typewriter';

describe('revealStep', () => {
  it('returns nothing for an empty buffer', () => {
    expect(revealStep('')).toEqual({ reveal: '', rest: '' });
  });

  it('reveals at least one char for a small trickle', () => {
    expect(revealStep('a', 20)).toEqual({ reveal: 'a', rest: '' });
  });

  it('drains a large backlog faster (ceil(len / framesToDrain) chars)', () => {
    // 40 chars over 20 frames → 2 chars this step.
    const pending = 'x'.repeat(40);
    const { reveal, rest } = revealStep(pending, 20);
    expect(reveal).toHaveLength(2);
    expect(rest).toHaveLength(38);
  });

  it('reveal + rest always reconstruct the input', () => {
    const { reveal, rest } = revealStep('hello world', 4);
    expect(reveal + rest).toBe('hello world');
  });
});
