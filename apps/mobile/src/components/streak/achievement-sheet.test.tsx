// apps/mobile/src/components/streak/achievement-sheet.test.tsx
import { render, screen } from '@testing-library/react-native';

jest.mock('./badge-image', () => ({
  BadgeImage: ({ label }: { label: string }) =>
    jest.requireActual<typeof import('react')>('react').createElement('Text', null, `badge:${label}`),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

import type { AchievementDefView } from '@finby/shared';
import { AchievementSheet } from './achievement-sheet';

const ACH: AchievementDefView = {
  id: 'streak-bronze', slug: 'streak-bronze', category: 'STREAK', tier: 'BRONZE',
  threshold: 7, label: 'Week Warrior', description: 'Maintain a 7-day streak',
};

describe('AchievementSheet', () => {
  it('shows how-to-unlock and the tier for a locked achievement', async () => {
    await render(<AchievementSheet workspaceId="w1" achievement={ACH} onClose={jest.fn()} />);
    expect(screen.getByText(/How to unlock: Maintain a 7-day streak/)).toBeTruthy();
    expect(screen.getByText('Bronze')).toBeTruthy();
  });

  it('shows the unlock time and description for an unlocked achievement', async () => {
    await render(
      <AchievementSheet workspaceId="w1" achievement={ACH} unlockedAt={new Date().toISOString()} onClose={jest.fn()} />,
    );
    expect(screen.getByText(/Unlocked just now/)).toBeTruthy();
    expect(screen.getByText('Maintain a 7-day streak')).toBeTruthy();
  });

  it('renders nothing when no achievement is selected', async () => {
    await render(<AchievementSheet workspaceId="w1" achievement={null} onClose={jest.fn()} />);
    expect(screen.queryByText('Bronze')).toBeNull();
  });
});
