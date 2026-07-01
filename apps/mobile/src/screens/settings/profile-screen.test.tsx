import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

const setUser = jest.fn();
const mockState = { user: { displayName: 'Tee', timezone: 'UTC', email: 't@e.co', accountNumber: 'FB-123' }, setUser };
jest.mock('../../lib/use-auth-store', () => ({ useAuthStore: (s: (x: unknown) => unknown) => s(mockState) }));
jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn() }) }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: ({ children }: { children: unknown }) => children, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('expo-blur', () => ({ BlurView: ({ children }: { children: unknown }) => children }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn().mockResolvedValue(true) }));
jest.mock('../../lib/runtime.native', () => ({ api: { settings: { updateProfile: jest.fn() } } }));

import { ProfileScreen } from './profile-screen';
import { api } from '../../lib/runtime.native';
const settings = api.settings as unknown as { updateProfile: jest.Mock };

beforeEach(() => { setUser.mockReset(); settings.updateProfile.mockReset().mockResolvedValue({ displayName: 'Tee 2', timezone: 'UTC' }); });

describe('ProfileScreen', () => {
  it('saves an edited name and updates the store', async () => {
    await render(<ProfileScreen />);
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Tee 2');
    await fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(settings.updateProfile).toHaveBeenCalledWith({ displayName: 'Tee 2', timezone: 'UTC' }));
    expect(setUser).toHaveBeenCalled();
  });
});
