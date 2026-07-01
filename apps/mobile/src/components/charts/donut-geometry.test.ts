import { describe, expect, it } from 'vitest';
import { donutSegments } from './donut-geometry';

describe('donutSegments', () => {
  it('splits the circumference proportionally with cumulative offsets', () => {
    const segs = donutSegments([1, 3], 100); // total 4 → 25 / 75
    expect(segs).toHaveLength(2);
    expect(segs[0]).toEqual({ length: 25, offset: 0 });
    expect(segs[1]).toEqual({ length: 75, offset: 25 });
  });

  it('returns zero-length segments when the total is zero', () => {
    expect(donutSegments([0, 0], 100)).toEqual([
      { length: 0, offset: 0 },
      { length: 0, offset: 0 },
    ]);
  });

  it('handles a single value as the full ring', () => {
    expect(donutSegments([5], 100)).toEqual([{ length: 100, offset: 0 }]);
  });
});
