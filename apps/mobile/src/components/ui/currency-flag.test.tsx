import { render, screen } from '@testing-library/react-native';
import { CurrencyFlag } from './currency-flag';

describe('CurrencyFlag', () => {
  it('renders a bundled flag image for a mapped currency', async () => {
    await render(<CurrencyFlag currency="USD" />);
    expect(screen.getByTestId('currency-flag-image')).toBeTruthy();
    expect(screen.queryByTestId('currency-flag-fallback')).toBeNull();
  });

  it('falls back to the code in a circle for an unmapped currency', async () => {
    await render(<CurrencyFlag currency="XYZ" />);
    expect(screen.getByTestId('currency-flag-fallback')).toBeTruthy();
    expect(screen.getByText('XYZ')).toBeTruthy();
  });
});
