import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

const setUser = jest.fn();
const mockState = { user: { preferences: { dateFormat: 'MEDIUM', currencyDisplay: 'SYMBOL', numberFormat: 'GROUPED' } }, setUser };
jest.mock('../../lib/use-auth-store', () => ({ useAuthStore: (s: (x: unknown) => unknown) => s(mockState) }));
jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn() }) }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: ({ children }: { children: unknown }) => children, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('expo-blur', () => ({ BlurView: ({ children }: { children: unknown }) => children }));
jest.mock('../../lib/runtime.native', () => ({ api: { settings: { updateProfile: jest.fn() } } }));

import { PreferencesScreen } from './preferences-screen';
import { api } from '../../lib/runtime.native';
const settings = api.settings as unknown as { updateProfile: jest.Mock };

beforeEach(() => { setUser.mockReset(); settings.updateProfile.mockReset().mockResolvedValue({ preferences: { dateFormat: 'ISO' } }); });

describe('PreferencesScreen', () => {
  it('saves a date format change immediately', async () => {
    await render(<PreferencesScreen />);
    await fireEvent.press(screen.getByLabelText('Date format'));          // open dropdown
    await fireEvent.press(screen.getByText('2026-06-07'));                // ISO option label
    await waitFor(() => expect(settings.updateProfile).toHaveBeenCalledWith({ preferences: { dateFormat: 'ISO' } }));
    expect(setUser).toHaveBeenCalled();
  });
});
