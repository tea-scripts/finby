import { render, screen, fireEvent } from '@testing-library/react-native';
import { Input } from './input';

describe('Input', () => {
  it('renders value and fires onChangeText', async () => {
    const onChangeText = jest.fn();
    await render(<Input testID="email" value="a@b.com" onChangeText={onChangeText} />);
    expect(screen.getByTestId('email').props.value).toBe('a@b.com');
    fireEvent.changeText(screen.getByTestId('email'), 'c@d.com');
    expect(onChangeText).toHaveBeenCalledWith('c@d.com');
  });
});
