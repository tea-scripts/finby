import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { ApiError } from '@finby/core';

const authState = {
  workspace: { id: 'w1' },
  user: { id: 'u1', displayName: 'Tee', currentStreak: 7 },
};
jest.mock('../lib/use-auth-store', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) => selector(authState),
}));

// Create the chat mocks INSIDE the factory (so the module's `api.chat` and the
// test's `mockChat` are the same object), then retrieve them via the mock.
jest.mock('../lib/runtime.native', () => ({
  api: {
    chat: {
      listConversations: jest.fn(),
      createConversation: jest.fn(),
      listMessages: jest.fn(),
      streamMessage: jest.fn(),
    },
  },
}));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, back: jest.fn() }) }));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: unknown }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('lottie-react-native', () => 'LottieView');

import { api } from '../lib/runtime.native';
import { ChatScreen } from './chat-screen';

const mockChat = api.chat as unknown as {
  listConversations: jest.Mock;
  createConversation: jest.Mock;
  listMessages: jest.Mock;
  streamMessage: jest.Mock;
};

beforeEach(() => {
  mockChat.listConversations.mockReset().mockResolvedValue([{ id: 'c1' }]);
  mockChat.createConversation.mockReset().mockResolvedValue({ id: 'c1' });
  mockChat.listMessages.mockReset().mockResolvedValue({ messages: [] });
  mockChat.streamMessage.mockReset();
  mockPush.mockReset();
});

describe('ChatScreen', () => {
  it('bootstraps the conversation and shows the empty greeting', async () => {
    await render(<ChatScreen />);
    await waitFor(() => expect(mockChat.listMessages).toHaveBeenCalledWith('w1', 'c1'));
    expect(screen.getByText(/Hey, Tee/)).toBeTruthy();
  });

  it('shows the streak badge in the header', async () => {
    await render(<ChatScreen />);
    expect(screen.getByText('7')).toBeTruthy();
  });

  it('streams an assistant reply and renders a logged action card', async () => {
    mockChat.streamMessage.mockImplementation(async (_ws, _c, _content, handlers) => {
      handlers.onText('Logged ');
      handlers.onText('lunch.');
      handlers.onAction({
        type: 'TRANSACTION_CREATED',
        transactionId: 't1',
        txType: 'EXPENSE',
        preview: { amount: '12.00', currency: 'USD', merchant: 'Cafe', category: 'Food' },
        currentStreak: 1,
      });
      handlers.onDone({ id: 'm1', role: 'ASSISTANT', content: 'Logged lunch.', createdAt: '2026-06-24T00:00:00Z' });
    });

    await render(<ChatScreen />);
    await waitFor(() => expect(mockChat.listMessages).toHaveBeenCalled());

    await fireEvent.changeText(screen.getByTestId('composer-input'), 'spent 12 on lunch');
    await fireEvent.press(screen.getByTestId('composer-send'));

    await waitFor(() =>
      expect(mockChat.streamMessage).toHaveBeenCalledWith('w1', 'c1', 'spent 12 on lunch', expect.anything()),
    );
    await waitFor(() => expect(screen.getByText('Logged lunch.')).toBeTruthy());
    expect(screen.getByText('✓ Logged')).toBeTruthy();
    expect(screen.getByText('spent 12 on lunch')).toBeTruthy();
  });

  it('shows a notice and drops the placeholder when the stream fails pre-start', async () => {
    mockChat.streamMessage.mockRejectedValue(new ApiError(503, 'DOWN', 'Service unavailable'));
    await render(<ChatScreen />);
    await waitFor(() => expect(mockChat.listMessages).toHaveBeenCalled());

    await fireEvent.changeText(screen.getByTestId('composer-input'), 'hi');
    await fireEvent.press(screen.getByTestId('composer-send'));

    await waitFor(() => expect(screen.getByText('Service unavailable')).toBeTruthy());
  });

});
