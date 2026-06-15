import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { StreakCalendar } from './StreakCalendar';

vi.mock('../../lib/streaks-api', () => ({ getStreakCalendar: vi.fn() }));

const state = { workspace: { id: 'w1' } };
vi.mock('../../lib/store', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  useAuth: vi.fn((selector: any) => selector(state)),
}));

import { getStreakCalendar } from '../../lib/streaks-api';
const mockGet = vi.mocked(getStreakCalendar);

beforeEach(() => vi.clearAllMocks());

describe('StreakCalendar', () => {
  it('fetches and renders an active-day cell with an accessible label', async () => {
    mockGet.mockResolvedValue({
      from: '2026-06-09',
      to: '2026-06-10',
      activeDays: ['2026-06-10'],
      repairedDays: [],
    });

    render(<StreakCalendar />);

    await waitFor(() => expect(mockGet).toHaveBeenCalledWith('w1'));
    expect(await screen.findByLabelText('2026-06-10: logged')).toBeInTheDocument();
    expect(screen.getByLabelText('2026-06-09: missed')).toBeInTheDocument();
  });

  it('shows a missed cell when there is no history', async () => {
    mockGet.mockResolvedValue({ from: '2026-06-10', to: '2026-06-10', activeDays: [], repairedDays: [] });
    render(<StreakCalendar />);
    expect(await screen.findByLabelText('2026-06-10: missed')).toBeInTheDocument();
  });
});
