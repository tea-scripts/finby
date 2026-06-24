import { render, screen } from '@testing-library/react-native';

jest.mock('@expo/vector-icons', () => ({
  Ionicons: ({ name }: { name: string }) =>
    jest.requireActual<typeof import('react')>('react').createElement('Text', null, name),
}));

import { StreakBadge } from './streak-badge';

describe('StreakBadge', () => {
  it('shows the streak count with a flame', async () => {
    await render(<StreakBadge streak={5} />);
    expect(screen.getByText('5')).toBeTruthy();
    expect(screen.getByText('flame')).toBeTruthy();
  });

  it('shows zero', async () => {
    await render(<StreakBadge streak={0} />);
    expect(screen.getByText('0')).toBeTruthy();
  });
});
