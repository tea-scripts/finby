import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DEFAULT_PREFERENCES } from '@finby/shared';
import type { ApiUser } from '../../lib/types';
import { AnnouncementHost } from './announcement-host';

vi.mock('../ui/lottie', () => ({
  Lottie: ({ src }: { src: string }) => <div data-testid="lottie" data-src={src} />,
}));

const { state, setUser, updateProfile, enablePush } = vi.hoisted(() => ({
  state: { value: null as unknown },
  setUser: vi.fn(),
  updateProfile: vi.fn(),
  enablePush: vi.fn(),
}));

vi.mock('../../lib/store', () => ({
  useAuth: (selector: (s: unknown) => unknown) => selector(state.value),
}));
vi.mock('../../lib/settings-api', () => ({ updateProfile }));
vi.mock('../../lib/push', () => ({ enablePush }));

function makeUser(dismissed: string[]): ApiUser {
  return {
    id: 'u1',
    displayName: 'Alex',
    email: 'a@b.com',
    emailVerified: true,
    timezone: 'UTC',
    accountNumber: 'FB-1',
    preferences: { ...DEFAULT_PREFERENCES, dismissedAnnouncements: dismissed },
    currentStreak: 0,
    longestStreak: 0,
  };
}

function setState(dismissed: string[]) {
  state.value = { user: makeUser(dismissed), workspace: { id: 'w1' }, setUser };
}

beforeEach(() => {
  vi.clearAllMocks();
  enablePush.mockResolvedValue('on');
  setState([]);
});

describe('AnnouncementHost', () => {
  it('shows the first undismissed announcement (streaks)', () => {
    render(<AnnouncementHost />);
    expect(screen.getByText('Streaks are here')).toBeInTheDocument();
  });

  it('persists dismissal via updateProfile when the primary "Got it" is clicked', async () => {
    updateProfile.mockResolvedValue(makeUser(['streaks-2026-06']));
    render(<AnnouncementHost />);

    fireEvent.click(screen.getByRole('button', { name: 'Got it' }));

    await waitFor(() =>
      expect(updateProfile).toHaveBeenCalledWith({
        preferences: { dismissedAnnouncements: ['streaks-2026-06'] },
      }),
    );
    await waitFor(() => expect(setUser).toHaveBeenCalled());
  });

  it('shows the notifications announcement once streaks is dismissed', () => {
    setState(['streaks-2026-06']);
    render(<AnnouncementHost />);
    expect(screen.getByRole('heading', { name: 'Turn on notifications' })).toBeInTheDocument();
  });

  it('runs enablePush then persists dismissal for the notifications CTA', async () => {
    setState(['streaks-2026-06']);
    updateProfile.mockResolvedValue(makeUser(['streaks-2026-06', 'in-app-notifs-2026-06']));
    render(<AnnouncementHost />);

    fireEvent.click(screen.getByRole('button', { name: 'Turn on notifications' }));

    await waitFor(() => expect(enablePush).toHaveBeenCalledWith('w1'));
    await waitFor(() =>
      expect(updateProfile).toHaveBeenCalledWith({
        preferences: { dismissedAnnouncements: ['streaks-2026-06', 'in-app-notifs-2026-06'] },
      }),
    );
  });

  it('renders nothing when every announcement is dismissed', () => {
    setState(['streaks-2026-06', 'in-app-notifs-2026-06']);
    const { container } = render(<AnnouncementHost />);
    expect(container.firstChild).toBeNull();
  });

  it('"Remind me later" closes without persisting', () => {
    render(<AnnouncementHost />);
    fireEvent.click(screen.getByRole('button', { name: /remind me later/i }));
    expect(updateProfile).not.toHaveBeenCalled();
    expect(screen.queryByText('Streaks are here')).not.toBeInTheDocument();
  });
});
