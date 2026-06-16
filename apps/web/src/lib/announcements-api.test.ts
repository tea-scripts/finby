import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { AnnouncementView } from '@finby/shared';

const authed = vi.fn();
vi.mock('./store', () => ({ useAuth: { getState: () => ({ authed }) } }));

import { getActiveAnnouncement, markDismissed, markSeen } from './announcements-api';

const view: AnnouncementView = {
  id: 'an1', mode: 'STEPS', title: 'Turn on notifications', body: 'b',
  emoji: '🔔', imageUrl: null, lottieKey: 'notif-bell', hashtag: 'Stay on track',
  confetti: false, steps: [{ label: 'Tap', caption: 'cap' }],
  primaryLabel: 'Turn on notifications', primaryKind: 'ENABLE_PUSH', expiresAt: null,
};

describe('announcements-api', () => {
  beforeEach(() => authed.mockReset());

  it('maps the API view onto the modal Announcement shape (lottie path resolved)', async () => {
    authed.mockResolvedValue({ announcement: view });
    const result = await getActiveAnnouncement();
    expect(authed).toHaveBeenCalledWith('/announcements/active');
    expect(result).toEqual({
      id: 'an1', mode: 'steps', title: 'Turn on notifications', body: 'b',
      emoji: '🔔', image: undefined, lottie: '/lottie/notif-bell.json', hashtag: 'Stay on track',
      confetti: false, steps: [{ label: 'Tap', caption: 'cap' }],
      primary: { label: 'Turn on notifications', kind: 'enable-push' }, expiresAt: undefined,
    });
  });

  it('returns null when there is no active announcement', async () => {
    authed.mockResolvedValue({ announcement: null });
    expect(await getActiveAnnouncement()).toBeNull();
  });

  it('markSeen and markDismissed POST to the right endpoints', async () => {
    authed.mockResolvedValue(undefined);
    await markSeen('an1');
    await markDismissed('an1');
    expect(authed).toHaveBeenCalledWith('/announcements/an1/seen', { method: 'POST' });
    expect(authed).toHaveBeenCalledWith('/announcements/an1/dismiss', { method: 'POST' });
  });
});
