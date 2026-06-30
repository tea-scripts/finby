// apps/mobile/src/components/streak/achievements-grid.test.tsx
import { render, screen, fireEvent } from '@testing-library/react-native';

jest.mock('./badge-image', () => ({
  BadgeImage: ({ label, locked }: { label: string; locked: boolean }) =>
    jest.requireActual<typeof import('react')>('react').createElement('Text', null, `${label}:${locked ? 'locked' : 'unlocked'}`),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

import type { AchievementsResult } from '@finby/shared';
import { AchievementsGrid } from './achievements-grid';

const def = (slug: string, label: string, category = 'STREAK', tier = 'BRONZE') =>
  ({ id: slug, slug, category, tier, threshold: 1, label, description: '' });

describe('AchievementsGrid', () => {
  it('renders unlocked and locked badges with the unlock date for unlocked', async () => {
    const achievements = {
      unlocked: [{ id: 'u', unlockedAt: new Date().toISOString(), achievementDef: def('week', 'Week Warrior') }],
      locked: [def('month', 'Month Master', 'STREAK', 'SILVER')],
    } as unknown as AchievementsResult;
    await render(<AchievementsGrid workspaceId="w1" achievements={achievements} />);
    expect(screen.getByText('Week Warrior:unlocked')).toBeTruthy();
    expect(screen.getByText('Month Master:locked')).toBeTruthy();
    expect(screen.getByText('just now')).toBeTruthy();
  });

  it('opens the detail sheet when an achievement is tapped', async () => {
    const achievements = {
      unlocked: [],
      locked: [def('streak-bronze', 'Week Warrior', 'STREAK', 'BRONZE')],
    } as unknown as AchievementsResult;
    await render(<AchievementsGrid workspaceId="w1" achievements={achievements} />);
    await fireEvent.press(screen.getByTestId('achievement-streak-bronze'));
    expect(screen.getByText('Bronze')).toBeTruthy();
  });
});
