import { render, screen, fireEvent } from '@testing-library/react-native';
import { TermsModal } from './terms-modal';

describe('TermsModal', () => {
  it('shows disabled button with scroll prompt when visible and not read', async () => {
    const onRead = jest.fn();
    const onClose = jest.fn();
    await render(
      <TermsModal visible={true} read={false} onRead={onRead} onClose={onClose} />,
    );
    expect(screen.getByText('Scroll to the bottom to continue')).toBeTruthy();
    // Disabled Pressable won't fire onPress in RNTL
    fireEvent.press(screen.getByText('Scroll to the bottom to continue'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('shows enabled button and calls onClose when read=true', async () => {
    const onRead = jest.fn();
    const onClose = jest.fn();
    await render(
      <TermsModal visible={true} read={true} onRead={onRead} onClose={onClose} />,
    );
    expect(screen.getByText("I've read the Terms")).toBeTruthy();
    await fireEvent.press(screen.getByText("I've read the Terms"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onRead when scrolled to bottom', async () => {
    const onRead = jest.fn();
    const onClose = jest.fn();
    await render(
      <TermsModal visible={true} read={false} onRead={onRead} onClose={onClose} />,
    );
    await fireEvent(screen.getByTestId('terms-scrollview'), 'scroll', {
      nativeEvent: {
        layoutMeasurement: { height: 600 },
        contentOffset: { y: 2000 },
        contentSize: { height: 2400 },
      },
    });
    expect(onRead).toHaveBeenCalled();
  });

  it('renders Terms section titles', async () => {
    const onRead = jest.fn();
    const onClose = jest.fn();
    await render(
      <TermsModal visible={true} read={false} onRead={onRead} onClose={onClose} />,
    );
    expect(screen.getByText('1. Eligibility')).toBeTruthy();
  });
});
