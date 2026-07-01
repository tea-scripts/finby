import { render, screen, fireEvent } from '@testing-library/react-native';
import { SettingsRow } from './settings-row';

describe('SettingsRow', () => {
  it('renders label + value and fires onPress', async () => {
    const onPress = jest.fn();
    await render(<SettingsRow label="Profile" value="Tee" onPress={onPress} />);
    expect(screen.getByText('Profile')).toBeTruthy();
    expect(screen.getByText('Tee')).toBeTruthy();
    fireEvent.press(screen.getByText('Profile'));
    expect(onPress).toHaveBeenCalled();
  });

  it('does not fire when disabled', async () => {
    const onPress = jest.fn();
    await render(<SettingsRow label="Refer & Earn" onPress={onPress} disabled />);
    fireEvent.press(screen.getByText('Refer & Earn'));
    expect(onPress).not.toHaveBeenCalled();
  });
});
