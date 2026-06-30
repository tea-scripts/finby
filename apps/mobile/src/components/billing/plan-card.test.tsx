import { render, screen } from '@testing-library/react-native';

jest.mock('@expo/vector-icons', () => ({
  Ionicons: ({ name }: { name: string }) =>
    jest.requireActual<typeof import('react')>('react').createElement('Text', null, name),
}));

import { PlanCard } from './plan-card';

describe('PlanCard', () => {
  it('shows a paid tier name, monthly price and features', async () => {
    await render(<PlanCard tier="PRO" current={false} />);
    expect(screen.getByText('Pro')).toBeTruthy();
    expect(screen.getByText('$4.99/mo')).toBeTruthy();
    expect(screen.getByText('90-day conversation memory')).toBeTruthy();
  });

  it('shows Free with no price and a Current marker when current', async () => {
    await render(<PlanCard tier="FREE" current />);
    expect(screen.getByText('Free')).toBeTruthy();
    expect(screen.getByText('Current plan')).toBeTruthy();
  });
});
