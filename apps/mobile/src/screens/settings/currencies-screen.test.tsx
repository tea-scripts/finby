import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

const setWorkspace = jest.fn();
const mockState = { workspace: { id: 'w1', tier: 'PRO', baseCurrency: 'USD', preferredCurrencies: ['USD'] }, setWorkspace };
jest.mock('../../lib/use-auth-store', () => ({ useAuthStore: (s: (x: unknown) => unknown) => s(mockState) }));
jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn() }) }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: ({ children }: { children: unknown }) => children, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../../lib/runtime.native', () => ({ api: { settings: { updateBaseCurrency: jest.fn(), updateCurrencies: jest.fn() } } }));

import { CurrenciesScreen } from './currencies-screen';
import { api } from '../../lib/runtime.native';
const settings = api.settings as unknown as { updateBaseCurrency: jest.Mock; updateCurrencies: jest.Mock };

beforeEach(() => {
  setWorkspace.mockReset();
  settings.updateBaseCurrency.mockReset().mockResolvedValue({ baseCurrency: 'EUR', preferredCurrencies: ['EUR', 'USD'], recomputed: 12 });
  settings.updateCurrencies.mockReset().mockResolvedValue({ preferredCurrencies: ['USD', 'EUR'] });
});

it('confirms and changes the base currency', async () => {
  await render(<CurrenciesScreen />);
  await fireEvent.press(screen.getByLabelText('Base currency'));         // open dropdown
  await fireEvent.press(screen.getByText('EUR — Euro'));                 // pick EUR
  await fireEvent.press(screen.getByText('Confirm change'));             // confirm sheet
  await waitFor(() => expect(settings.updateBaseCurrency).toHaveBeenCalledWith('w1', 'EUR'));
  expect(setWorkspace).toHaveBeenCalledWith({ baseCurrency: 'EUR', preferredCurrencies: ['EUR', 'USD'] });
});
