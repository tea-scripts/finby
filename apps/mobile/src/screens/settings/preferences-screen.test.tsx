import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';

const setUser = jest.fn();
const mockState = {
  workspace: { id: 'w1' },
  user: { preferences: { dateFormat: 'MEDIUM', currencyDisplay: 'SYMBOL', numberFormat: 'GROUPED', dailyReminders: true } },
  setUser,
};
jest.mock('../../lib/use-auth-store', () => ({ useAuthStore: (s: (x: unknown) => unknown) => s(mockState) }));
jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn() }) }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: ({ children }: { children: unknown }) => children, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('expo-blur', () => ({ BlurView: ({ children }: { children: unknown }) => children }));

const mockEnablePush = jest.fn().mockResolvedValue('on');
const mockDisablePush = jest.fn().mockResolvedValue('off');
const mockGetPushState = jest.fn().mockResolvedValue('off');
let mockPushState = 'off';
jest.mock('../../lib/use-push-store', () => ({
  usePushStore: (sel: (s: unknown) => unknown) => sel({ state: mockPushState, busy: false }),
}));
jest.mock('../../lib/runtime.native', () => ({
  api: { settings: { updateProfile: jest.fn() } },
  push: {
    enablePush: (...args: unknown[]) => mockEnablePush(...args),
    disablePush: (...args: unknown[]) => mockDisablePush(...args),
    getPushState: (...args: unknown[]) => mockGetPushState(...args),
  },
}));

import { PreferencesScreen } from './preferences-screen';
import { api } from '../../lib/runtime.native';
const settings = api.settings as unknown as { updateProfile: jest.Mock };

beforeEach(() => {
  setUser.mockReset();
  settings.updateProfile.mockReset().mockResolvedValue({ preferences: { dateFormat: 'ISO' } });
  mockEnablePush.mockClear();
  mockDisablePush.mockClear();
  mockGetPushState.mockClear();
  mockPushState = 'off';
});

afterEach(() => {
  jest.useRealTimers();
});

describe('PreferencesScreen', () => {
  it('saves a date format change immediately', async () => {
    await render(<PreferencesScreen />);
    await fireEvent.press(screen.getByLabelText('Date format'));          // open dropdown
    await fireEvent.press(screen.getByText('2026-06-07'));                // ISO option label
    await waitFor(() => expect(settings.updateProfile).toHaveBeenCalledWith({ preferences: { dateFormat: 'ISO' } }));
    expect(setUser).toHaveBeenCalled();
  });

  it('enabling the push toggle calls enablePush for the workspace', async () => {
    mockPushState = 'off';
    await render(<PreferencesScreen />);
    await fireEvent(screen.getByLabelText('Push notifications'), 'valueChange', true);
    await waitFor(() => expect(mockEnablePush).toHaveBeenCalledWith('w1'));
  });

  it('daily reminder toggle is disabled while push is off', async () => {
    mockPushState = 'off';
    await render(<PreferencesScreen />);
    expect(screen.getByLabelText('Daily reminder').props.accessibilityState.disabled).toBe(true);
  });

  it('saves a number format change (non-date dropdown)', async () => {
    settings.updateProfile.mockResolvedValue({ preferences: { numberFormat: 'PLAIN' } });
    await render(<PreferencesScreen />);
    await fireEvent.press(screen.getByLabelText('Number format'));
    await fireEvent.press(screen.getByText('1234.50'));                 // PLAIN option label
    await waitFor(() => expect(settings.updateProfile).toHaveBeenCalledWith({ preferences: { numberFormat: 'PLAIN' } }));
  });

  it('the "Saved" status auto-dismisses after 2 seconds', async () => {
    jest.useFakeTimers();
    await render(<PreferencesScreen />);
    await fireEvent.press(screen.getByLabelText('Date format'));
    await fireEvent.press(screen.getByText('2026-06-07'));
    await waitFor(() => expect(screen.getByText('Saved')).toBeTruthy());
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });
    expect(screen.queryByText('Saved')).toBeNull();
  });
});
