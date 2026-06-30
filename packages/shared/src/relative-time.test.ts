import { describe, expect, it } from 'vitest';
import { relativeTime } from './relative-time';

const NOW = new Date('2026-06-30T12:00:00Z');
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

describe('relativeTime', () => {
  it('formats recent and older timestamps without Intl', () => {
    expect(relativeTime(ago(10_000), NOW)).toBe('just now');
    expect(relativeTime(ago(5 * 60_000), NOW)).toBe('5 minutes ago');
    expect(relativeTime(ago(60_000), NOW)).toBe('1 minute ago');
    expect(relativeTime(ago(3 * 3_600_000), NOW)).toBe('3 hours ago');
    expect(relativeTime(ago(2 * 86_400_000), NOW)).toBe('2 days ago');
    expect(relativeTime(ago(40 * 86_400_000), NOW)).toBe('1 month ago');
  });
  it('returns empty string for an invalid date', () => {
    expect(relativeTime('not-a-date', NOW)).toBe('');
  });
});
