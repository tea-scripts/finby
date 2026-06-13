import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./store', () => ({
  useAuth: { getState: vi.fn() },
}));

import { useAuth } from './store';
import { createSupportTicket, listSupportTickets } from './support-api';

const mockAuthed = vi.fn();

beforeEach(() => {
  vi.mocked(useAuth.getState).mockReturnValue({
    authed: mockAuthed,
  } as unknown as ReturnType<typeof useAuth.getState>);
  mockAuthed.mockReset();
});

describe('createSupportTicket', () => {
  it('POSTs the ticket to /support/tickets', () => {
    mockAuthed.mockResolvedValue({ id: 't1' });
    createSupportTicket({ category: 'BUG', subject: 'Crash', message: 'It broke' });
    expect(mockAuthed).toHaveBeenCalledWith('/support/tickets', {
      method: 'POST',
      body: JSON.stringify({ category: 'BUG', subject: 'Crash', message: 'It broke' }),
    });
  });
});

describe('listSupportTickets', () => {
  it('GETs /support/tickets and unwraps the tickets array', async () => {
    mockAuthed.mockResolvedValue({ tickets: [{ id: 't1' }] });
    const tickets = await listSupportTickets();
    expect(mockAuthed).toHaveBeenCalledWith('/support/tickets', undefined);
    expect(tickets).toEqual([{ id: 't1' }]);
  });
});
