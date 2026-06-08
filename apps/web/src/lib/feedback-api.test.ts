import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./store', () => ({ useAuth: { getState: vi.fn() } }));

import { useAuth } from './store';
import { submitFeedback } from './feedback-api';

const mockAuthed = vi.fn();

beforeEach(() => {
  vi.mocked(useAuth.getState).mockReturnValue({ authed: mockAuthed } as unknown as ReturnType<
    typeof useAuth.getState
  >);
  mockAuthed.mockReset();
});

describe('submitFeedback', () => {
  it('POSTs rating + comment to /feedback', () => {
    mockAuthed.mockResolvedValue({ id: 'f1' });
    submitFeedback(5, 'great app');
    expect(mockAuthed).toHaveBeenCalledWith('/feedback', {
      method: 'POST',
      body: JSON.stringify({ rating: 5, comment: 'great app' }),
    });
  });

  it('omits a blank/whitespace comment', () => {
    mockAuthed.mockResolvedValue({ id: 'f2' });
    submitFeedback(4, '   ');
    expect(mockAuthed).toHaveBeenCalledWith('/feedback', {
      method: 'POST',
      body: JSON.stringify({ rating: 4 }),
    });
  });
});
