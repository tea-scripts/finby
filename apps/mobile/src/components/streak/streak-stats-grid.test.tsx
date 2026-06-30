// apps/mobile/src/components/streak/streak-stats-grid.test.tsx
import { render, screen } from '@testing-library/react-native';
import { StreakStatsGrid } from './streak-stats-grid';

describe('StreakStatsGrid', () => {
  it('renders the four stat tiles', async () => {
    await render(<StreakStatsGrid longestStreak={30} daysLogged={48} totalXp={1250} availableXp={40} />);
    expect(screen.getByText('Longest streak')).toBeTruthy();
    expect(screen.getByText('Total days logged')).toBeTruthy();
    expect(screen.getByText('48')).toBeTruthy();
    expect(screen.getByText('1,250 XP')).toBeTruthy();
    expect(screen.getByText('40 XP')).toBeTruthy();
  });
});
