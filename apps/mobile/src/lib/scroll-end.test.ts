import { describe, it, expect } from 'vitest';
import { isAtBottom } from './scroll-end';

describe('isAtBottom', () => {
  it('returns true at exact bottom', () => {
    expect(
      isAtBottom({
        layoutMeasurement: { height: 600 },
        contentOffset: { y: 1800 },
        contentSize: { height: 2400 },
      }),
    ).toBe(true);
  });

  it('returns true when within threshold of bottom', () => {
    expect(
      isAtBottom({
        layoutMeasurement: { height: 600 },
        contentOffset: { y: 1795 },
        contentSize: { height: 2400 },
      }),
    ).toBe(true);
  });

  it('returns false when near top of a long document', () => {
    expect(
      isAtBottom({
        layoutMeasurement: { height: 600 },
        contentOffset: { y: 0 },
        contentSize: { height: 2400 },
      }),
    ).toBe(false);
  });

  it('returns true when content is shorter than the viewport (fits without scrolling)', () => {
    expect(
      isAtBottom({
        layoutMeasurement: { height: 600 },
        contentOffset: { y: 0 },
        contentSize: { height: 400 },
      }),
    ).toBe(true);
  });
});
