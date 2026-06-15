import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { StreakStartPrompt } from './StreakStartPrompt';
import { STREAK_START_SHOWN_KEY } from '../../lib/streak-start';

vi.mock('../../lib/push', () => ({ enablePush: vi.fn().mockResolvedValue('on') }));
vi.mock('../../lib/ios', () => ({ detectIosSafariTab: vi.fn() }));
vi.mock('../app/install-sheet', () => ({
  InstallSheet: ({ open }: { open: boolean }) => (open ? <div data-testid="install-sheet" /> : null),
}));

const state = { workspace: { id: 'w1' } };
vi.mock('../../lib/store', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  useAuth: vi.fn((selector: any) => selector(state)),
}));

import { enablePush } from '../../lib/push';
import { detectIosSafariTab } from '../../lib/ios';
const mockEnable = vi.mocked(enablePush);
const mockIsIos = vi.mocked(detectIosSafariTab);

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mockIsIos.mockReturnValue(false);
});

describe('StreakStartPrompt', () => {
  it('push browser: Enable reminders calls enablePush and marks shown', async () => {
    const onClose = vi.fn();
    render(<StreakStartPrompt open onClose={onClose} streak={1} />);

    fireEvent.click(screen.getByRole('button', { name: /enable reminders/i }));

    await waitFor(() => expect(mockEnable).toHaveBeenCalledWith('w1'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(localStorage.getItem(STREAK_START_SHOWN_KEY)).toBe('1');
  });

  it('iOS Safari tab: shows Install Finby which opens the install sheet', async () => {
    mockIsIos.mockReturnValue(true);
    render(<StreakStartPrompt open onClose={vi.fn()} streak={1} />);

    fireEvent.click(screen.getByRole('button', { name: /install finby/i }));

    expect(await screen.findByTestId('install-sheet')).toBeInTheDocument();
    expect(mockEnable).not.toHaveBeenCalled();
  });

  it('dismissing marks shown so it never reappears', () => {
    const onClose = vi.fn();
    render(<StreakStartPrompt open onClose={onClose} streak={1} />);

    fireEvent.click(screen.getByRole('button', { name: /not now/i }));

    expect(onClose).toHaveBeenCalled();
    expect(localStorage.getItem(STREAK_START_SHOWN_KEY)).toBe('1');
  });

  it('renders nothing when closed', () => {
    const { container } = render(<StreakStartPrompt open={false} onClose={vi.fn()} streak={1} />);
    expect(container).toBeEmptyDOMElement();
  });
});
