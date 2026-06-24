import { render, screen, fireEvent } from '@testing-library/react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';

jest.mock('expo-blur', () => ({
  BlurView: ({ children }: { children: unknown }) => children,
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@expo/vector-icons', () => ({
  Ionicons: ({ name }: { name: string }) =>
    jest.requireActual<typeof import('react')>('react').createElement('Text', null, name),
}));

import { FloatingTabBar } from './floating-tab-bar';

function makeProps(index: number, navigate: jest.Mock, emit: jest.Mock): BottomTabBarProps {
  return {
    state: {
      index,
      routes: [
        { key: 'index-1', name: 'index' },
        { key: 'dashboard-1', name: 'dashboard' },
        { key: 'transactions-1', name: 'transactions' },
        { key: 'settings-1', name: 'settings' },
      ],
    },
    navigation: { emit, navigate },
  } as unknown as BottomTabBarProps;
}

describe('FloatingTabBar', () => {
  it('renders the four tabs with the active one filled', async () => {
    const props = makeProps(0, jest.fn(), jest.fn(() => ({ defaultPrevented: false })));
    await render(<FloatingTabBar {...props} />);
    expect(screen.getByTestId('tab-index')).toBeTruthy();
    expect(screen.getByTestId('tab-dashboard')).toBeTruthy();
    expect(screen.getByTestId('tab-transactions')).toBeTruthy();
    expect(screen.getByTestId('tab-settings')).toBeTruthy();
    // active tab (index) shows the filled glyph; an inactive one shows its outline
    expect(screen.getByText('chatbubble-ellipses')).toBeTruthy();
    expect(screen.getByText('grid-outline')).toBeTruthy();
  });

  it('navigates to a tab on press when it is not already focused', async () => {
    const navigate = jest.fn();
    const props = makeProps(0, navigate, jest.fn(() => ({ defaultPrevented: false })));
    await render(<FloatingTabBar {...props} />);
    fireEvent.press(screen.getByTestId('tab-dashboard'));
    expect(navigate).toHaveBeenCalledWith('dashboard');
  });

  it('does not navigate when pressing the already-focused tab', async () => {
    const navigate = jest.fn();
    const props = makeProps(0, navigate, jest.fn(() => ({ defaultPrevented: false })));
    await render(<FloatingTabBar {...props} />);
    fireEvent.press(screen.getByTestId('tab-index'));
    expect(navigate).not.toHaveBeenCalled();
  });
});
