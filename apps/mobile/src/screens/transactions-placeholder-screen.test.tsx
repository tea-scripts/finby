import { render, screen } from '@testing-library/react-native';

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: unknown }) => children,
}));
jest.mock('@expo/vector-icons', () => ({
  Ionicons: ({ name }: { name: string }) =>
    require('react').createElement('Text', null, name),
}));

import { TransactionsPlaceholderScreen } from './transactions-placeholder-screen';

describe('TransactionsPlaceholderScreen', () => {
  it('renders the coming-soon copy', async () => {
    await render(<TransactionsPlaceholderScreen />);
    expect(screen.getByText('Transactions')).toBeTruthy();
    expect(screen.getByText(/coming soon/i)).toBeTruthy();
  });
});
