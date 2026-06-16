import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { AdminAnnouncement } from '@finby/shared';
import { AnnouncementsTable } from './AnnouncementsTable';

vi.mock('next/navigation', () => ({ usePathname: () => '/announcements' }));

const announcements = vi.fn();
const announcementAssets = vi.fn();
const archiveAnnouncement = vi.fn();
const restoreAnnouncement = vi.fn();
vi.mock('../lib/api', () => ({
  api: {
    announcements: () => announcements(),
    announcementAssets: () => announcementAssets(),
    archiveAnnouncement: (id: string) => archiveAnnouncement(id),
    restoreAnnouncement: (id: string) => restoreAnnouncement(id),
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

const archivedRow: AdminAnnouncement = { ...row, id: 'an2', title: 'Old promo', status: 'ARCHIVED' };

/** Drive the custom (non-native) status-filter dropdown. */
function selectFilter(label: string) {
  fireEvent.click(screen.getByRole('button', { name: 'Filter by status' }));
  fireEvent.click(screen.getByRole('option', { name: label }));
}

describe('AnnouncementsTable', () => {
  beforeEach(() => {
    announcements.mockReset().mockResolvedValue([row]);
    announcementAssets.mockReset().mockResolvedValue({ lottie: [] });
    archiveAnnouncement.mockReset().mockResolvedValue(undefined);
    restoreAnnouncement.mockReset().mockResolvedValue(undefined);
  });

  it('renders rows with title, status, and seen/dismissed counts', async () => {
    render(<AnnouncementsTable />);
    expect(await screen.findByText('Streaks are here')).toBeInTheDocument();
    expect(screen.getByText('Published')).toBeInTheDocument();
    expect(screen.getByText(/1240/)).toBeInTheDocument();
    expect(screen.getByText(/880/)).toBeInTheDocument();
  });

  it('archives a row only after confirming in the modal, then refetches', async () => {
    render(<AnnouncementsTable />);
    await screen.findByText('Streaks are here');

    // Clicking Archive opens a confirmation modal but does NOT archive yet.
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
    expect(archiveAnnouncement).not.toHaveBeenCalled();
    const dialog = screen.getByRole('dialog', { name: 'Archive announcement' });
    expect(dialog).toBeInTheDocument();

    // Confirming inside the modal archives and refetches.
    fireEvent.click(within(dialog).getByRole('button', { name: 'Archive' }));
    expect(archiveAnnouncement).toHaveBeenCalledWith('an1');
    await waitFor(() => expect(announcements).toHaveBeenCalledTimes(2));
  });

  it('cancelling the confirmation modal does not archive', async () => {
    render(<AnnouncementsTable />);
    await screen.findByText('Streaks are here');
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(archiveAnnouncement).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: 'Archive announcement' })).not.toBeInTheDocument();
  });

  it('hides archived announcements by default and reveals them via the filter', async () => {
    announcements.mockReset().mockResolvedValue([row, archivedRow]);
    render(<AnnouncementsTable />);
    await screen.findByText('Streaks are here');
    // Archived row is hidden under the default "Active" filter.
    expect(screen.queryByText('Old promo')).not.toBeInTheDocument();

    selectFilter('Archived');
    expect(screen.queryByText('Streaks are here')).not.toBeInTheDocument();
    expect(screen.getByText('Old promo')).toBeInTheDocument();

    selectFilter('All');
    expect(screen.getByText('Streaks are here')).toBeInTheDocument();
    expect(screen.getByText('Old promo')).toBeInTheDocument();
  });

  it('restores an archived row immediately (no confirm) and refetches', async () => {
    announcements.mockReset().mockResolvedValue([archivedRow]);
    render(<AnnouncementsTable />);
    await waitFor(() => expect(announcements).toHaveBeenCalled());
    // Hidden by default; reveal via the filter, then restore.
    expect(screen.queryByText('Old promo')).not.toBeInTheDocument();
    selectFilter('Archived');
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    expect(restoreAnnouncement).toHaveBeenCalledWith('an2');
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
