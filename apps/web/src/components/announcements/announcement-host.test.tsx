import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Announcement } from '@/lib/announcements';
import { AnnouncementHost } from './announcement-host';

const getActiveAnnouncement = vi.fn();
const markSeen = vi.fn();
const markDismissed = vi.fn();
vi.mock('@/lib/announcements-api', () => ({
  getActiveAnnouncement: () => getActiveAnnouncement(),
  markSeen: (id: string) => markSeen(id),
  markDismissed: (id: string) => markDismissed(id),
}));

const enablePush = vi.fn();
vi.mock('@/lib/push', () => ({ enablePush: (id: string) => enablePush(id) }));

vi.mock('@/lib/store', () => ({
  useAuth: (sel: (s: unknown) => unknown) =>
    sel({ user: { id: 'u1' }, workspace: { id: 'w1' } }),
}));

const dismissAnn: Announcement = {
  id: 'an1', mode: 'simple', title: 'Streaks are here', body: 'b',
  primary: { label: 'Got it', kind: 'dismiss' },
};
const pushAnn: Announcement = {
  id: 'an2', mode: 'steps', title: 'Turn on notifications', body: 'b',
  steps: [{ label: 'Tap', caption: 'c' }],
  primary: { label: 'Turn on notifications', kind: 'enable-push' },
};

describe('AnnouncementHost', () => {
  beforeEach(() => {
    getActiveAnnouncement.mockReset();
    markSeen.mockReset().mockResolvedValue(undefined);
    markDismissed.mockReset().mockResolvedValue(undefined);
    enablePush.mockReset().mockResolvedValue(undefined);
  });

  it('renders the active announcement and records an impression', async () => {
    getActiveAnnouncement.mockResolvedValue(dismissAnn);
    render(<AnnouncementHost />);
    expect(await screen.findByText('Streaks are here')).toBeInTheDocument();
    await waitFor(() => expect(markSeen).toHaveBeenCalledWith('an1'));
  });

  it('renders nothing when there is no active announcement', async () => {
    getActiveAnnouncement.mockResolvedValue(null);
    const { container } = render(<AnnouncementHost />);
    await waitFor(() => expect(getActiveAnnouncement).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('persists dismissal on the primary "Got it" action and closes', async () => {
    getActiveAnnouncement.mockResolvedValue(dismissAnn);
    render(<AnnouncementHost />);
    fireEvent.click(await screen.findByRole('button', { name: 'Got it' }));
    await waitFor(() => expect(markDismissed).toHaveBeenCalledWith('an1'));
    await waitFor(() => expect(screen.queryByText('Streaks are here')).not.toBeInTheDocument());
  });

  it('runs enablePush then dismisses for the enable-push CTA', async () => {
    getActiveAnnouncement.mockResolvedValue(pushAnn);
    render(<AnnouncementHost />);
    fireEvent.click(await screen.findByRole('button', { name: 'Turn on notifications' }));
    await waitFor(() => expect(enablePush).toHaveBeenCalledWith('w1'));
    await waitFor(() => expect(markDismissed).toHaveBeenCalledWith('an2'));
  });

  it('"Remind me later" closes for the session without persisting', async () => {
    getActiveAnnouncement.mockResolvedValue(dismissAnn);
    render(<AnnouncementHost />);
    fireEvent.click(await screen.findByRole('button', { name: /remind me later/i }));
    expect(markDismissed).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByText('Streaks are here')).not.toBeInTheDocument());
  });
});
