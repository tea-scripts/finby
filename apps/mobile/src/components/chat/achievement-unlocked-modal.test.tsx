import { Share } from 'react-native';
import { render, screen, fireEvent } from '@testing-library/react-native';

const mockCelebrateHaptic = jest.fn();
jest.mock('../../lib/haptics', () => ({ celebrateHaptic: () => mockCelebrateHaptic() }));
jest.mock('react-native-confetti-cannon', () => () =>
  jest.requireActual<typeof import('react')>('react').createElement('Text', null, 'confetti'));
jest.mock('../streak/badge-image', () => ({
  BadgeImage: ({ label }: { label: string }) =>
    jest.requireActual<typeof import('react')>('react').createElement('Text', null, `badge:${label}`),
}));

import type { NewAchievement } from '@finby/shared';
import { AchievementUnlockedModal } from './achievement-unlocked-modal';

const ACH: NewAchievement = { slug: 'streak-bronze', tier: 'BRONZE', label: 'Week Warrior', unlockedAt: '2026-07-01T00:00:00Z' };

beforeEach(() => mockCelebrateHaptic.mockReset());

describe('AchievementUnlockedModal', () => {
  it('celebrates: confetti, headline, badge, tier, label, and a haptic on appear', async () => {
    await render(<AchievementUnlockedModal workspaceId="w1" achievement={ACH} remaining={1} onContinue={jest.fn()} />);
    expect(screen.getByText('Achievement unlocked! 🎉')).toBeTruthy();
    expect(screen.getByText('badge:Week Warrior')).toBeTruthy();
    expect(screen.getByText('Bronze')).toBeTruthy();
    expect(screen.getByText('Week Warrior')).toBeTruthy();
    expect(screen.getByText('confetti')).toBeTruthy();
    expect(mockCelebrateHaptic).toHaveBeenCalledTimes(1);
  });

  it('Continue calls onContinue', async () => {
    const onContinue = jest.fn();
    await render(<AchievementUnlockedModal workspaceId="w1" achievement={ACH} remaining={1} onContinue={onContinue} />);
    await fireEvent.press(screen.getByText('Continue'));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('shows the remaining count on Continue when more are queued', async () => {
    await render(<AchievementUnlockedModal workspaceId="w1" achievement={ACH} remaining={3} onContinue={jest.fn()} />);
    expect(screen.getByText('Next (2 more)')).toBeTruthy();
  });

  it('Share shares the brag text', async () => {
    const spy = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' } as never);
    await render(<AchievementUnlockedModal workspaceId="w1" achievement={ACH} remaining={1} onContinue={jest.fn()} />);
    await fireEvent.press(screen.getByText('Share'));
    expect(spy).toHaveBeenCalledWith({ message: 'I just unlocked "Week Warrior" on Finby!' });
    spy.mockRestore();
  });

  it('renders nothing when there is no achievement', async () => {
    await render(<AchievementUnlockedModal workspaceId="w1" achievement={null} remaining={0} onContinue={jest.fn()} />);
    expect(screen.queryByText('Achievement unlocked! 🎉')).toBeNull();
    expect(mockCelebrateHaptic).not.toHaveBeenCalled();
  });
});
