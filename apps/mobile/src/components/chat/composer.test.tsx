import { render, screen, fireEvent } from '@testing-library/react-native';
import { Composer } from './composer';

describe('Composer', () => {
  it('sends trimmed text and clears the input', async () => {
    const onSend = jest.fn();
    await render(<Composer disabled={false} onSend={onSend} />);
    await fireEvent.changeText(screen.getByTestId('composer-input'), '  hi there  ');
    await fireEvent.press(screen.getByTestId('composer-send'));
    expect(onSend).toHaveBeenCalledWith('hi there');
    expect(screen.getByTestId('composer-input').props.value).toBe('');
  });

  it('does not send empty / whitespace-only input', async () => {
    const onSend = jest.fn();
    await render(<Composer disabled={false} onSend={onSend} />);
    await fireEvent.changeText(screen.getByTestId('composer-input'), '   ');
    await fireEvent.press(screen.getByTestId('composer-send'));
    expect(onSend).not.toHaveBeenCalled();
  });

  it('does not send while disabled', async () => {
    const onSend = jest.fn();
    await render(<Composer disabled={true} onSend={onSend} />);
    await fireEvent.changeText(screen.getByTestId('composer-input'), 'hi');
    await fireEvent.press(screen.getByTestId('composer-send'));
    expect(onSend).not.toHaveBeenCalled();
  });

  it('renders the scan button and fires onScanReceipt when provided', async () => {
    const onScanReceipt = jest.fn();
    await render(<Composer disabled={false} onSend={jest.fn()} onScanReceipt={onScanReceipt} />);
    await fireEvent.press(screen.getByTestId('composer-scan'));
    expect(onScanReceipt).toHaveBeenCalled();
  });

  it('omits the scan button when onScanReceipt is not provided', async () => {
    await render(<Composer disabled={false} onSend={jest.fn()} />);
    expect(screen.queryByTestId('composer-scan')).toBeNull();
  });
});
