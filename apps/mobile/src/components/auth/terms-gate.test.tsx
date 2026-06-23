import { render, screen, fireEvent } from '@testing-library/react-native';

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: unknown }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

import { TermsGate } from './terms-gate';

describe('TermsGate', () => {
  let onAcceptedChange: jest.Mock;

  beforeEach(() => {
    onAcceptedChange = jest.fn();
  });

  it('blocks accept until terms are read — opens modal instead', async () => {
    await render(<TermsGate accepted={false} onAcceptedChange={onAcceptedChange} />);
    await fireEvent(screen.getByLabelText('Accept terms'), 'valueChange', true);
    expect(onAcceptedChange).not.toHaveBeenCalled();
    expect(screen.getByTestId('terms-scrollview')).toBeTruthy();
  });

  it('allows accept after reading terms', async () => {
    await render(<TermsGate accepted={false} onAcceptedChange={onAcceptedChange} />);
    // Open modal by toggling (read=false)
    await fireEvent(screen.getByLabelText('Accept terms'), 'valueChange', true);
    // Scroll to bottom to mark as read
    await fireEvent(screen.getByTestId('terms-scrollview'), 'scroll', {
      nativeEvent: {
        layoutMeasurement: { height: 600 },
        contentOffset: { y: 2000 },
        contentSize: { height: 2400 },
      },
    });
    // Close modal
    await fireEvent.press(screen.getByText("I've read the Terms"));
    // Now toggle should call onAcceptedChange
    await fireEvent(screen.getByLabelText('Accept terms'), 'valueChange', true);
    expect(onAcceptedChange).toHaveBeenCalledWith(true);
  });

  it('shows hint when unread, hides it after reading', async () => {
    await render(<TermsGate accepted={false} onAcceptedChange={onAcceptedChange} />);
    expect(screen.getByText('Open the Terms and scroll to the end to continue.')).toBeTruthy();
    // Open modal by toggling (read=false)
    await fireEvent(screen.getByLabelText('Accept terms'), 'valueChange', true);
    // Scroll to bottom to mark as read
    await fireEvent(screen.getByTestId('terms-scrollview'), 'scroll', {
      nativeEvent: {
        layoutMeasurement: { height: 600 },
        contentOffset: { y: 2000 },
        contentSize: { height: 2400 },
      },
    });
    // Close modal
    await fireEvent.press(screen.getByText("I've read the Terms"));
    expect(screen.queryByText('Open the Terms and scroll to the end to continue.')).toBeNull();
  });
});
