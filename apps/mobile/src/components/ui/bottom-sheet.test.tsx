import { render, screen, fireEvent } from '@testing-library/react-native';
import { Text } from 'react-native';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

import { BottomSheet } from './bottom-sheet';

describe('BottomSheet', () => {
  it('renders title and children when open', async () => {
    await render(
      <BottomSheet open onClose={jest.fn()} title="Filters">
        <Text>BODY</Text>
      </BottomSheet>,
    );
    expect(screen.getByText('Filters')).toBeTruthy();
    expect(screen.getByText('BODY')).toBeTruthy();
  });

  it('closes when the scrim is tapped', async () => {
    const onClose = jest.fn();
    await render(
      <BottomSheet open onClose={onClose}>
        <Text>BODY</Text>
      </BottomSheet>,
    );
    fireEvent.press(screen.getByTestId('sheet-scrim'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
