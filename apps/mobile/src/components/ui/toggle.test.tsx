import { render, screen, fireEvent } from '@testing-library/react-native';
import { Toggle } from './toggle';

describe('Toggle', () => {
  it('reflects value and fires onValueChange', async () => {
    const onValueChange = jest.fn();
    await render(<Toggle value={false} onValueChange={onValueChange} accessibilityLabel="Biometric lock" />);
    const sw = screen.getByLabelText('Biometric lock');
    expect(sw.props.value).toBe(false);
    fireEvent(sw, 'valueChange', true);
    expect(onValueChange).toHaveBeenCalledWith(true);
  });
});
