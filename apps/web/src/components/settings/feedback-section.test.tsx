import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../../lib/analytics', () => ({ track: vi.fn() }));
vi.mock('../../lib/feedback-api', () => ({ submitFeedback: vi.fn() }));

import { submitFeedback } from '../../lib/feedback-api';
import { track } from '../../lib/analytics';
import { FeedbackSection } from './feedback-section';

const mockSubmit = vi.mocked(submitFeedback);
const mockTrack = vi.mocked(track);

beforeEach(() => vi.clearAllMocks());

describe('FeedbackSection', () => {
  it('opens the review modal from the section button', async () => {
    render(<FeedbackSection />);
    fireEvent.click(screen.getByRole('button', { name: /write a review/i }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /submit review/i })).toBeInTheDocument(),
    );
  });

  it('submit is disabled until a rating is chosen', async () => {
    render(<FeedbackSection />);
    fireEvent.click(screen.getByRole('button', { name: /write a review/i }));
    const submit = await screen.findByRole('button', { name: /submit review/i });
    expect(submit).toBeDisabled();

    fireEvent.click(screen.getByRole('radio', { name: /4 stars/i }));
    expect(submit).not.toBeDisabled();
  });

  it('submits the rating + comment, tracks it, and shows a thank-you', async () => {
    mockSubmit.mockResolvedValue({ id: 'f1', rating: 5, comment: 'love it', createdAt: 'now' });
    render(<FeedbackSection />);

    fireEvent.click(screen.getByRole('button', { name: /write a review/i }));
    fireEvent.click(await screen.findByRole('radio', { name: /5 stars/i }));
    fireEvent.change(screen.getByPlaceholderText(/anything you'd like us to know/i), {
      target: { value: 'love it' },
    });
    fireEvent.click(screen.getByRole('button', { name: /submit review/i }));

    await waitFor(() => expect(mockSubmit).toHaveBeenCalledWith(5, 'love it'));
    expect(mockTrack).toHaveBeenCalledWith('feedback_submitted', { rating: 5 });
    await waitFor(() => expect(screen.getByText(/thank you/i)).toBeInTheDocument());
  });

  it('uses a >=16px comment field so mobile browsers do not zoom on focus', async () => {
    render(<FeedbackSection />);
    fireEvent.click(screen.getByRole('button', { name: /write a review/i }));
    const textarea = await screen.findByPlaceholderText(/anything you'd like us to know/i);
    // text-base = 16px on mobile; anything smaller triggers iOS focus-zoom.
    expect(textarea.className).toContain('text-base');
  });

  it('shows an error message if the submit fails', async () => {
    mockSubmit.mockRejectedValue(new Error('network'));
    render(<FeedbackSection />);

    fireEvent.click(screen.getByRole('button', { name: /write a review/i }));
    fireEvent.click(await screen.findByRole('radio', { name: /3 stars/i }));
    fireEvent.click(screen.getByRole('button', { name: /submit review/i }));

    await waitFor(() =>
      expect(screen.getByText(/couldn't send your review/i)).toBeInTheDocument(),
    );
  });
});
