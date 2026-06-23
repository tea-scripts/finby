import { describe, expect, it, vi } from 'vitest';
import { createSupportApi } from './support-api';

const ok = (payload: unknown) => vi.fn(async () => payload as never);

describe('createSupportApi', () => {
  it('createSupportTicket POSTs the ticket', async () => {
    const authed = ok({ id: 's1' });
    await createSupportApi(authed).createSupportTicket({
      category: 'BUG', subject: 'x', message: 'y',
    });
    expect(authed).toHaveBeenCalledWith('/support/tickets', {
      method: 'POST',
      body: JSON.stringify({ category: 'BUG', subject: 'x', message: 'y' }),
    });
  });
  it('listSupportTickets unwraps the { tickets } envelope', async () => {
    const authed = ok({ tickets: [{ id: 's1' }] });
    await expect(createSupportApi(authed).listSupportTickets()).resolves.toEqual([{ id: 's1' }]);
  });
});
