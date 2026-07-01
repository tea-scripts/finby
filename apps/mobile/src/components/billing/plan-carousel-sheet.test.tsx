import { Linking } from 'react-native';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

jest.mock('expo-blur', () => ({ BlurView: ({ children }: { children: unknown }) => children }));
jest.mock('@expo/vector-icons', () => ({
  Ionicons: ({ name }: { name: string }) =>
    jest.requireActual<typeof import('react')>('react').createElement('Text', null, name),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

import { PlanCarouselSheet } from './plan-carousel-sheet';

describe('PlanCarouselSheet', () => {
  it('renders all four tiers and marks the current one', async () => {
    await render(<PlanCarouselSheet open onClose={jest.fn()} currentTier="FREE" />);
    expect(screen.getByText('Free')).toBeTruthy();
    expect(screen.getByText('Pro')).toBeTruthy();
    expect(screen.getByText('Premium')).toBeTruthy();
    expect(screen.getByText('Family')).toBeTruthy();
    expect(screen.getByText('Current plan')).toBeTruthy();
  });

  it('a non-current CTA closes the sheet and opens web billing', async () => {
    const onClose = jest.fn();
    const spy = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    await render(<PlanCarouselSheet open onClose={onClose} currentTier="FREE" />);
    await fireEvent.press(screen.getByText('Upgrade to Pro'));
    expect(onClose).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(spy).toHaveBeenCalledWith('https://chat.finby.app/settings'));
    spy.mockRestore();
  });
});
