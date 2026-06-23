import { render, screen } from '@testing-library/react-native';
import { PasswordStrengthMeter } from './password-strength-meter';

describe('PasswordStrengthMeter', () => {
  it('renders nothing for an empty password', async () => {
    await render(<PasswordStrengthMeter password="" />);
    expect(screen.queryByText(/Weak|So-so|Strong/)).toBeNull();
  });
  it('shows Strong for a long varied password', async () => {
    await render(<PasswordStrengthMeter password="Abcd1234efgh!" />);
    expect(screen.getByText('Strong')).toBeTruthy();
  });
});
