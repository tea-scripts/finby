import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn() }) }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: ({ children }: { children: unknown }) => children, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('expo-blur', () => ({ BlurView: ({ children }: { children: unknown }) => children }));
jest.mock('../../lib/runtime.native', () => ({ api: { support: { createSupportTicket: jest.fn(), listSupportTickets: jest.fn() } } }));
import { SupportScreen } from './support-screen';
import { api } from '../../lib/runtime.native';
const support = api.support as unknown as { createSupportTicket: jest.Mock; listSupportTickets: jest.Mock };

beforeEach(() => {
  support.listSupportTickets.mockReset().mockResolvedValue([]);
  support.createSupportTicket.mockReset().mockResolvedValue({ id: 't1', category: 'BUG', subject: 'x', message: 'y', status: 'OPEN', createdAt: '' });
});

it('submits a ticket', async () => {
  await render(<SupportScreen />);
  await fireEvent.changeText(screen.getByLabelText('Subject'), 'Broken button');
  await fireEvent.changeText(screen.getByLabelText('Message'), 'It does nothing.');
  await fireEvent.press(screen.getByText('Send'));
  await waitFor(() => expect(support.createSupportTicket).toHaveBeenCalledWith({ category: 'BUG', subject: 'Broken button', message: 'It does nothing.' }));
});
