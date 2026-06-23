import { describe, expect, it, vi } from 'vitest';
import { createFeedbackApi } from './feedback-api';

const ok = (payload: unknown) => vi.fn(async () => payload as never);

describe('createFeedbackApi', () => {
  it('submitFeedback POSTs rating, trimming and including a non-empty comment', async () => {
    const authed = ok({ id: 'f1' });
    await createFeedbackApi(authed).submitFeedback(5, '  great  ');
    expect(authed).toHaveBeenCalledWith('/feedback', {
      method: 'POST',
      body: JSON.stringify({ rating: 5, comment: 'great' }),
    });
  });
  it('submitFeedback omits an empty/whitespace comment', async () => {
    const authed = ok({ id: 'f1' });
    await createFeedbackApi(authed).submitFeedback(4, '   ');
    expect(authed).toHaveBeenCalledWith('/feedback', {
      method: 'POST',
      body: JSON.stringify({ rating: 4 }),
    });
  });
});
