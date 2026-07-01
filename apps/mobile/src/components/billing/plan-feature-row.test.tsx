import { render, screen } from '@testing-library/react-native';
import { PlanFeatureRow } from './plan-feature-row';

describe('PlanFeatureRow', () => {
  it('renders the label, note, subtext and badge', async () => {
    await render(
      <PlanFeatureRow feature={{ label: 'Receipt scanning', note: '20 scans/day', subtext: 'OCR powered', badge: 'beta' }} />,
    );
    expect(screen.getByText('Receipt scanning')).toBeTruthy();
    expect(screen.getByText(/20 scans\/day/)).toBeTruthy();
    expect(screen.getByText('OCR powered')).toBeTruthy();
    expect(screen.getByText('beta')).toBeTruthy();
  });

  it('renders just the label when there are no extras', async () => {
    await render(<PlanFeatureRow feature={{ label: 'Spending streak' }} />);
    expect(screen.getByText('Spending streak')).toBeTruthy();
  });

  it('renders a bare blue check glyph (matching the web FeatureRow), not a green icon', async () => {
    await render(<PlanFeatureRow feature={{ label: 'Spending streak' }} />);
    const check = screen.getByText('✓');
    expect(check.props.style).toMatchObject({ color: '#1d6ef5' });
  });
});
