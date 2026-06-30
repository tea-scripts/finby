// apps/mobile/src/components/streak/week-row.test.tsx
import { render, screen } from '@testing-library/react-native';

jest.mock('@expo/vector-icons', () => ({
  Ionicons: ({ name }: { name: string }) =>
    jest.requireActual<typeof import('react')>('react').createElement('Text', null, name),
}));

import { WeekRow } from './week-row';

describe('WeekRow', () => {
  it('marks active and repaired days with a check and shows weekday labels', async () => {
    await render(<WeekRow activeDays={['2026-06-29']} repairedDays={['2026-06-30']} today="2026-06-30" />);
    expect(screen.getAllByText('checkmark')).toHaveLength(2);
    expect(screen.getAllByText('M').length).toBeGreaterThan(0);
  });

  it('shows the day number for a future day', async () => {
    await render(<WeekRow activeDays={[]} repairedDays={[]} today="2026-06-29" />);
    // 2026-06-29 is Monday → Sunday 07-05 is future → shows "5".
    expect(screen.getByText('5')).toBeTruthy();
  });
});
