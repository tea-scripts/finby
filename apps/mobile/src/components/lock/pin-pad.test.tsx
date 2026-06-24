import { render, screen, fireEvent } from '@testing-library/react-native';
import { PinPad } from './pin-pad';

describe('PinPad', () => {
  it('appends a digit on key press', async () => {
    const onChange = jest.fn();
    await render(<PinPad length={4} value="12" onChange={onChange} />);
    await fireEvent.press(screen.getByTestId('pin-key-3'));
    expect(onChange).toHaveBeenCalledWith('123');
  });

  it('removes the last digit on backspace', async () => {
    const onChange = jest.fn();
    await render(<PinPad length={4} value="123" onChange={onChange} />);
    await fireEvent.press(screen.getByTestId('pin-key-back'));
    expect(onChange).toHaveBeenCalledWith('12');
  });

  it('ignores key presses once the PIN is full', async () => {
    const onChange = jest.fn();
    await render(<PinPad length={4} value="1234" onChange={onChange} />);
    await fireEvent.press(screen.getByTestId('pin-key-5'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('renders one dot per length', async () => {
    await render(<PinPad length={4} value="12" onChange={() => {}} />);
    expect(screen.getByTestId('pin-dot-0')).toBeTruthy();
    expect(screen.getByTestId('pin-dot-3')).toBeTruthy();
  });
});
