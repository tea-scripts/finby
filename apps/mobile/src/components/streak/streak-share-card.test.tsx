// apps/mobile/src/components/streak/streak-share-card.test.tsx
import { render, screen } from '@testing-library/react-native';

jest.mock('@expo/vector-icons', () => ({
  Ionicons: ({ name }: { name: string }) =>
    jest.requireActual<typeof import('react')>('react').createElement('Text', null, name),
}));
jest.mock('../ui/wordmark', () => ({ Wordmark: () => null }));

import { StreakShareCard } from './streak-share-card';

describe('StreakShareCard', () => {
  it('renders the name, streak and stats', async () => {
    await render(<StreakShareCard stats={{ name: 'Timilehin', streak: 30, best: 30, xp: 1250, daysLogged: 48 }} />);
    expect(screen.getByText('Timilehin')).toBeTruthy();
    expect(screen.getByText('30')).toBeTruthy();
    expect(screen.getByText(/1,250 XP/)).toBeTruthy();
    expect(screen.getByText(/48 days logged/)).toBeTruthy();
    expect(screen.getByText('finby.app')).toBeTruthy();
  });
});
