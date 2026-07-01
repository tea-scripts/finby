import { render, screen } from '@testing-library/react-native';
import { TierBadge } from './tier-badge';

describe('TierBadge', () => {
  it('renders the tier label', async () => {
    await render(<TierBadge tier="PREMIUM" />);
    expect(screen.getByText('Premium')).toBeTruthy();
  });
});
