import { afterEach, describe, expect, it } from 'vitest';
import { clearBadgeCache, getCachedBadge, setCachedBadge } from './badge-cache';

afterEach(() => clearBadgeCache());

describe('badge cache', () => {
  it('returns undefined for an uncached badge', () => {
    expect(getCachedBadge('w1', 'x')).toBeUndefined();
  });

  it('stores and returns a badge by workspace + slug', () => {
    setCachedBadge('w1', 'x', '<svg-a/>');
    expect(getCachedBadge('w1', 'x')).toBe('<svg-a/>');
    // keyed by both workspace and slug
    expect(getCachedBadge('w2', 'x')).toBeUndefined();
    expect(getCachedBadge('w1', 'y')).toBeUndefined();
  });

  it('clears all entries', () => {
    setCachedBadge('w1', 'x', '<svg/>');
    clearBadgeCache();
    expect(getCachedBadge('w1', 'x')).toBeUndefined();
  });
});
