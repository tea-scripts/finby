// apps/mobile/src/components/streak/streak-overview.test.tsx
import { render, screen } from '@testing-library/react-native';
jest.mock('@expo/vector-icons', () => ({
  Ionicons: ({ name }: { name: string }) =>
    jest.requireActual<typeof import('react')>('react').createElement('Text', null, name),
}));
import { StreakOverview } from './streak-overview';

describe('StreakOverview', () => {
  it('shows the current streak and best', async () => {
    await render(<StreakOverview currentStreak={7} longestStreak={30} />);
    expect(screen.getByText('7')).toBeTruthy();
    expect(screen.getByText(/Best/)).toBeTruthy();
    expect(screen.getByText(/30/)).toBeTruthy();
  });
});
