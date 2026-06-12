import { describe, it, expect } from 'vitest';
import { pickAnnouncement, type Announcement } from './announcements';

const a = (id: string, expiresAt?: string): Announcement => ({
  id,
  mode: 'simple',
  title: id,
  body: '',
  primary: { label: 'Got it', kind: 'dismiss' },
  ...(expiresAt ? { expiresAt } : {}),
});

const NOW = new Date('2026-06-12T00:00:00Z');

describe('pickAnnouncement', () => {
  it('returns the first announcement when none are dismissed', () => {
    expect(pickAnnouncement([a('one'), a('two')], [], NOW)?.id).toBe('one');
  });

  it('skips dismissed announcements', () => {
    expect(pickAnnouncement([a('one'), a('two')], ['one'], NOW)?.id).toBe('two');
  });

  it('skips expired announcements', () => {
    const expired = a('old', '2026-06-01T00:00:00Z');
    expect(pickAnnouncement([expired, a('two')], [], NOW)?.id).toBe('two');
  });

  it('keeps announcements whose expiry is in the future', () => {
    const live = a('live', '2026-12-31T00:00:00Z');
    expect(pickAnnouncement([live], [], NOW)?.id).toBe('live');
  });

  it('returns null when everything is dismissed or expired', () => {
    expect(pickAnnouncement([a('one'), a('two')], ['one', 'two'], NOW)).toBeNull();
  });

  it('returns null for an empty list', () => {
    expect(pickAnnouncement([], [], NOW)).toBeNull();
  });
});
