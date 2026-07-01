import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn() }) }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: ({ children }: { children: unknown }) => children, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('expo-blur', () => ({ BlurView: ({ children }: { children: unknown }) => children }));
jest.mock('../../lib/runtime.native', () => ({ api: { feedback: { submitFeedback: jest.fn() } } }));
import { FeedbackScreen } from './feedback-screen';
import { api } from '../../lib/runtime.native';
const feedback = api.feedback as unknown as { submitFeedback: jest.Mock };

beforeEach(() => feedback.submitFeedback.mockReset().mockResolvedValue({ id: 'f1', rating: 5, comment: null, createdAt: '' }));

it('submits a rating and shows the thank-you state', async () => {
  await render(<FeedbackScreen />);
  await fireEvent.press(screen.getByLabelText('Rate 5'));
  await fireEvent.press(screen.getByText('Submit review'));
  await waitFor(() => expect(feedback.submitFeedback).toHaveBeenCalledWith(5, ''));
  await waitFor(() => expect(screen.getByText(/Thank you/)).toBeTruthy());
});
