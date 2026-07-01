import { render, screen } from '@testing-library/react-native';

import { CompareTable } from './compare-table';

describe('CompareTable', () => {
  it('renders tier columns and known feature rows/values', async () => {
    await render(<CompareTable />);
    expect(screen.getByText('Free')).toBeTruthy();
    expect(screen.getByText('Family')).toBeTruthy();
    expect(screen.getByText('AI messages/day')).toBeTruthy();
    // FREE.chatMessagesPerDay = 20; PRO = null → 'Unlimited'
    expect(screen.getByText('20')).toBeTruthy();
    expect(screen.getAllByText('Unlimited').length).toBeGreaterThan(0);
    // FREE.members = 1; FAMILY = 5
    expect(screen.getByText('Up to 5')).toBeTruthy();
  });
});
