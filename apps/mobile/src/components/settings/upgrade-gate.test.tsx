import { render, screen } from '@testing-library/react-native';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../billing/plan-carousel-sheet', () => ({ PlanCarouselSheet: () => null }));

import { Text } from 'react-native';
import { UpgradeGate } from './upgrade-gate';

describe('UpgradeGate', () => {
  it('shows children when the tier meets the requirement', async () => {
    await render(
      <UpgradeGate currentTier="PRO" requiredTier="PRO">
        <Text>Chips</Text>
      </UpgradeGate>,
    );
    expect(screen.getByText('Chips')).toBeTruthy();
  });

  it('gates children on FREE tier', async () => {
    await render(
      <UpgradeGate currentTier="FREE" requiredTier="PRO">
        <Text>Chips</Text>
      </UpgradeGate>,
    );
    expect(screen.queryByText('Chips')).toBeNull();
    expect(screen.getByText('Upgrade')).toBeTruthy();
  });
});
