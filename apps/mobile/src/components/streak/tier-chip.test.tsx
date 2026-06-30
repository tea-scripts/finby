// apps/mobile/src/components/streak/tier-chip.test.tsx
import { render, screen } from '@testing-library/react-native';
import { TierChip } from './tier-chip';

describe('TierChip', () => {
  it('renders the capitalized tier label', async () => {
    await render(<TierChip tier="BRONZE" />);
    expect(screen.getByText('Bronze')).toBeTruthy();
  });

  it('falls back to the raw tier for an unknown value', async () => {
    await render(<TierChip tier="PLATINUM" />);
    expect(screen.getByText('PLATINUM')).toBeTruthy();
  });
});
