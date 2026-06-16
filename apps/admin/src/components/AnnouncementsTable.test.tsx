import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { AdminAnnouncement } from '@finby/shared';
import { AnnouncementsTable } from './AnnouncementsTable';

vi.mock('next/navigation', () => ({ usePathname: () => '/announcements' }));

const announcements = vi.fn();
const announcementAssets = vi.fn();
const deleteAnnouncement = vi.fn();
vi.mock('../lib/api', () => ({
  api: {
    announcements: () => announcements(),
    announcementAssets: () => announcementAssets(),
    deleteAnnouncement: (id: string) => deleteAnnouncement(id),
    createAnnouncement: vi.fn(),
    updateAnnouncement: vi.fn(),
  },
}));

const row: AdminAnnouncement = {
  id: 'an1', key: 'streaks-2026-06', status: 'PUBLISHED', mode: 'SIMPLE',
  title: 'Streaks are here', body: 'b', emoji: '🔥', imageUrl: null, lottieKey: 'streak-flame',
  hashtag: 'New', confetti: true, steps: null, primaryLabel: 'Got it', primaryKind: 'DISMISS',
  targetTier: null, order: 0, publishAt: null, expiresAt: null,
  createdAt: '2026-06-01T00:00:00.000Z', updatedAt: '2026-06-01T00:00:00.000Z',
  seenCount: 1240, dismissedCount: 880,
};

describe('AnnouncementsTable', () => {
  beforeEach(() => {
    announcements.mockReset().mockResolvedValue([row]);
    announcementAssets.mockReset().mockResolvedValue({ lottie: [] });
    deleteAnnouncement.mockReset().mockResolvedValue(undefined);
  });

  it('renders rows with title, status, and seen/dismissed counts', async () => {
    render(<AnnouncementsTable />);
    expect(await screen.findByText('Streaks are here')).toBeInTheDocument();
    expect(screen.getByText('Published')).toBeInTheDocument();
    expect(screen.getByText(/1240/)).toBeInTheDocument();
    expect(screen.getByText(/880/)).toBeInTheDocument();
  });

  it('deletes a row after confirmation and refetches', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<AnnouncementsTable />);
    await screen.findByText('Streaks are here');
    fireEvent.click(screen.getByRole('button', { name: /delete/i }));
    expect(deleteAnnouncement).toHaveBeenCalledWith('an1');
    await waitFor(() => expect(announcements).toHaveBeenCalledTimes(2));
  });

  it('opens the editor in a modal when "New announcement" is clicked', async () => {
    render(<AnnouncementsTable />);
    await screen.findByText('Streaks are here');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /new announcement/i }));
    expect(screen.getByRole('dialog', { name: 'New announcement' })).toBeInTheDocument();
  });
});
