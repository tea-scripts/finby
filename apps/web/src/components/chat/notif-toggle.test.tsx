import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NotifToggle } from './notif-toggle';
import { usePushStore } from '../../lib/push-store';

const WORKSPACE = { id: 'w1', tier: 'FREE' };

vi.mock('../../lib/store', () => ({
  useAuth: vi.fn((selector: (s: { workspace: typeof WORKSPACE }) => unknown) =>
    selector({ workspace: WORKSPACE }),
  ),
}));

vi.mock('../../lib/push', () => ({
  isPushSupported: vi.fn(() => true),
  getPushState: vi.fn(() => Promise.resolve('off')),
  enablePush: vi.fn(() => Promise.resolve('on')),
  disablePush: vi.fn(() => Promise.resolve('off')),
}));

vi.mock('../../lib/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

import { toast } from '../../lib/toast';

beforeEach(() => {
  vi.clearAllMocks();
  usePushStore.setState({ state: 'off', busy: false });
});

describe('NotifToggle', () => {
  it('toggling one instance immediately syncs every instance (shared store)', async () => {
    // Two bells mounted at once, like the header + the Settings toggle.
    render(
      <>
        <NotifToggle />
        <NotifToggle />
      </>,
    );

    const offButtons = await screen.findAllByRole('button', { name: /enable notifications/i });
    expect(offButtons).toHaveLength(2);
    const [first] = offButtons as [HTMLElement, HTMLElement];

    fireEvent.click(first);

    // BOTH instances flip to "on" — not just the one that was clicked.
    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /notifications on/i })).toHaveLength(2);
    });
    expect(first).toHaveAttribute('aria-pressed', 'true');
  });

  it('fires a toast when toggled on and again when toggled off', async () => {
    render(<NotifToggle />);

    const onClick = await screen.findByRole('button', { name: /enable notifications/i });
    fireEvent.click(onClick);
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Notifications on', expect.any(String)),
    );

    const offClick = await screen.findByRole('button', { name: /notifications on/i });
    fireEvent.click(offClick);
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Notifications off', expect.any(String)),
    );
  });
});
