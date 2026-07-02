import { describe, expect, it } from 'vitest';
import { trendGeometry } from './trend-geometry';

const DIMS = { width: 300, height: 100, padding: 10 };

describe('trendGeometry', () => {
  it('places evenly-spaced points spanning the padded width', () => {
    const g = trendGeometry([1, 2, 3], DIMS);
    expect(g.points).toHaveLength(3);
    expect(g.points[0]!.x).toBeCloseTo(10, 5); // padding
    expect(g.points[2]!.x).toBeCloseTo(290, 5); // width - padding
    expect(g.line.startsWith('M')).toBe(true);
    expect(g.area.startsWith('M')).toBe(true);
  });

  it('maps the max value to the top padding and zero to the bottom', () => {
    const g = trendGeometry([0, 10], DIMS);
    expect(g.points[1]!.y).toBeCloseTo(10, 5); // max → top (padding)
    expect(g.points[0]!.y).toBeCloseTo(90, 5); // 0 → height - padding
  });

  it('scales from a zero baseline so small deltas read small', () => {
    // 100 vs 102: with a 0→max scale the two points sit ~1.6px apart, not a
    // full-height swing (min→max autoscaling would put 100 at the bottom).
    const g = trendGeometry([100, 102], DIMS);
    expect(g.points[1]!.y).toBeCloseTo(10, 5); // max (102) → top padding
    expect(g.points[0]!.y).toBeCloseTo(10 + 80 * (1 - 100 / 102), 5); // ≈ 11.57
  });

  it('pins a flat non-zero series to the top without NaN', () => {
    const g = trendGeometry([5, 5, 5], DIMS);
    for (const p of g.points) expect(Number.isNaN(p.y)).toBe(false);
    expect(g.points[0]!.y).toBeCloseTo(10, 5); // all equal the max → top padding
  });

  it('puts an all-zero series on the baseline without NaN', () => {
    const g = trendGeometry([0, 0, 0], DIMS);
    for (const p of g.points) expect(Number.isNaN(p.y)).toBe(false);
    expect(g.points[0]!.y).toBeCloseTo(90, 5); // 0 → height - padding
  });
});
