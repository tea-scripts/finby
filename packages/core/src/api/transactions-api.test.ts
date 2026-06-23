import { describe, expect, it, vi } from 'vitest';
import { createTransactionsApi } from './transactions-api';

const ok = (payload: unknown) => vi.fn(async () => payload as never);

describe('createTransactionsApi', () => {
  it('listTransactions builds the query string (default limit 20, optional filters)', async () => {
    const authed = ok({ transactions: [], nextCursor: null, hasMore: false });
    await createTransactionsApi(authed).listTransactions('ws1', { type: 'EXPENSE', currency: 'USD' });
    expect(authed).toHaveBeenCalledWith(
      '/workspaces/ws1/transactions?limit=20&type=EXPENSE&currency=USD',
    );
  });

  it('createTransaction POSTs the input as JSON', async () => {
    const authed = ok({ id: 't1' });
    await createTransactionsApi(authed).createTransaction('ws1', {
      type: 'EXPENSE', amountOriginal: '5', currencyOriginal: 'USD',
    });
    expect(authed).toHaveBeenCalledWith('/workspaces/ws1/transactions', {
      method: 'POST',
      body: JSON.stringify({ type: 'EXPENSE', amountOriginal: '5', currencyOriginal: 'USD' }),
    });
  });

  it('voidTransaction issues a DELETE', async () => {
    const authed = ok({ message: 'ok' });
    await createTransactionsApi(authed).voidTransaction('ws1', 't1');
    expect(authed).toHaveBeenCalledWith('/workspaces/ws1/transactions/t1', { method: 'DELETE' });
  });

  it('listCategories unwraps the { categories } envelope', async () => {
    const authed = ok({ categories: [{ id: 'c1', name: 'Food', isArchived: false }] });
    await expect(createTransactionsApi(authed).listCategories('ws1')).resolves.toEqual([
      { id: 'c1', name: 'Food', isArchived: false },
    ]);
  });
});
