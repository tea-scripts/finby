import { PrismaService } from '../../prisma/prisma.service';
import { AccountsService } from '../accounts/accounts.service';
import { CategoriesService } from '../categories/categories.service';
import { FxService } from '../fx/fx.service';
import { LlmService } from '../llm/llm.service';
import { TransactionsService } from '../transactions/transactions.service';
import type { WorkspaceContext } from '../../common/context';
import type { LlmToolCall } from '../llm/llm.types';
import { ChatService } from './chat.service';
import { ConversationsService } from './conversations.service';

const workspace: WorkspaceContext = {
  id: 'w1',
  name: 'W',
  slug: 'w',
  tier: 'FREE',
  baseCurrency: 'USD',
};

function build(overrides?: {
  txCreate?: jest.Mock;
  getRate?: jest.Mock;
  findCategory?: jest.Mock;
  findAccount?: jest.Mock;
}) {
  const transactions = { create: overrides?.txCreate ?? jest.fn() };
  const fx = { getRate: overrides?.getRate ?? jest.fn() };
  const categories = { findByName: overrides?.findCategory ?? jest.fn().mockResolvedValue(null) };
  const accounts = { findByName: overrides?.findAccount ?? jest.fn().mockResolvedValue(null) };
  const service = new ChatService(
    {} as unknown as PrismaService,
    {} as unknown as ConversationsService,
    {} as unknown as LlmService,
    transactions as unknown as TransactionsService,
    fx as unknown as FxService,
    categories as unknown as CategoriesService,
    accounts as unknown as AccountsService,
  );
  return { service, transactions, fx, categories, accounts };
}

function call(name: string, input: Record<string, unknown>): LlmToolCall {
  return { id: 't1', name, input };
}

const txView = {
  id: 'tx1',
  amountOriginal: '50',
  currencyOriginal: 'USD',
  amountBase: '50',
  currencyBase: 'USD',
  merchant: 'SM',
  category: { id: 'c1', name: 'Groceries' },
  account: null,
};

describe('ChatService.executeTool', () => {
  it('log_expense with high confidence creates a transaction and returns an action', async () => {
    const txCreate = jest.fn().mockResolvedValue(txView);
    const { service, transactions } = build({ txCreate });

    const result = await service.executeTool(
      workspace,
      'u1',
      call('log_expense', {
        amountOriginal: '50',
        currencyOriginal: 'USD',
        merchant: 'SM',
        categoryName: 'Groceries',
        confidence: 0.95,
      }),
    );

    expect(transactions.create).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'EXPENSE', amountOriginal: '50', currencyOriginal: 'USD' }),
    );
    expect(result.action?.type).toBe('TRANSACTION_CREATED');
    expect(result.action?.transactionId).toBe('tx1');
  });

  it('log_expense with low confidence returns a pendingConfirmation and does not create', async () => {
    const { service, transactions } = build();
    const result = await service.executeTool(
      workspace,
      'u1',
      call('log_expense', { amountOriginal: '40', currencyOriginal: 'USD', confidence: 0.4 }),
    );
    expect(transactions.create).not.toHaveBeenCalled();
    expect(result.pending).toBeDefined();
    expect(result.pending?.draft).toMatchObject({ amountOriginal: '40' });
  });

  it('log_expense in a non-base currency on FREE is blocked by the currency limit', async () => {
    const { service, transactions } = build();
    const result = await service.executeTool(
      workspace,
      'u1',
      call('log_expense', { amountOriginal: '2200', currencyOriginal: 'PHP', confidence: 0.95 }),
    );
    expect(transactions.create).not.toHaveBeenCalled();
    expect(result.toolResult).toContain('tier_limit');
  });

  it('get_fx_rate returns the rate', async () => {
    const getRate = jest.fn().mockResolvedValue({ from: 'PHP', to: 'USD', rate: '0.0175' });
    const { service } = build({ getRate });
    const result = await service.executeTool(workspace, 'u1', call('get_fx_rate', { from: 'PHP', to: 'USD' }));
    expect(getRate).toHaveBeenCalledWith('PHP', 'USD', undefined);
    expect(result.toolResult).toContain('0.0175');
  });
});
