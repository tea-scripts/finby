import { render, screen, fireEvent } from '@testing-library/react-native';
import { Checkbox } from './checkbox';

describe('Checkbox', () => {
  it('reflects the checked prop via accessibility state', async () => {
    await render(<Checkbox checked={true} onChange={() => {}} accessibilityLabel="Accept terms" />);
    expect(screen.getByLabelText('Accept terms').props.accessibilityState.checked).toBe(true);
  });

  it('calls onChange with the toggled value when pressed', async () => {
    const onChange = jest.fn();
    await render(<Checkbox checked={false} onChange={onChange} accessibilityLabel="Accept terms" />);
    await fireEvent.press(screen.getByLabelText('Accept terms'));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('toggles back off from a checked state', async () => {
    const onChange = jest.fn();
    await render(<Checkbox checked={true} onChange={onChange} accessibilityLabel="Accept terms" />);
    await fireEvent.press(screen.getByLabelText('Accept terms'));
    expect(onChange).toHaveBeenCalledWith(false);
  });
});
