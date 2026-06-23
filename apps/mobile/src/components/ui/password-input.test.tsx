import { render, screen, fireEvent } from '@testing-library/react-native';
import { PasswordInput } from './password-input';

describe('PasswordInput', () => {
  it('starts secure and toggles visibility', async () => {
    await render(<PasswordInput testID="pw" value="secret" onChangeText={() => {}} />);
    expect(screen.getByTestId('pw').props.secureTextEntry).toBe(true);
    await fireEvent.press(screen.getByLabelText('Show password'));
    expect(screen.getByTestId('pw').props.secureTextEntry).toBe(false);
    await fireEvent.press(screen.getByLabelText('Hide password'));
    expect(screen.getByTestId('pw').props.secureTextEntry).toBe(true);
  });
});
