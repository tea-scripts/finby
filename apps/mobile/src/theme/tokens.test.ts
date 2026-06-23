import { describe, expect, it } from 'vitest';
import { COLORS } from './tokens';

describe('COLORS', () => {
  it('mirrors the web palette exactly', () => {
    expect(COLORS.canvas).toBe('#06101f');
    expect(COLORS.accent.DEFAULT).toBe('#1d6ef5');
    expect(COLORS.ink).toBe('#e8eef7');
    expect(COLORS.danger).toBe('#ef4444');
  });
});
