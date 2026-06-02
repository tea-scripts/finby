import { ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AccountsService } from '../accounts/accounts.service';
import { CategoriesService } from '../categories/categories.service';
import { FxService } from '../fx/fx.service';
import { LlmService } from '../llm/llm.service';
import { TransactionsService } from '../transactions/transactions.service';
import { BudgetsService } from '../budgets/budgets.service';
import { AnalyticsService } from '../analytics/analytics.service';
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
  const budgets = { createOrUpdate: jest.fn(), list: jest.fn().mockResolvedValue([]) };
  const analytics = { summary: jest.fn(), byCategory: jest.fn(), trend: jest.fn(), topMerchants: jest.fn() };
  const service = new ChatService(
    {} as unknown as PrismaService,
    {} as unknown as ConversationsService,
    {} as unknown as LlmService,
    transactions as unknown as TransactionsService,
    fx as unknown as FxService,
    categories as unknown as CategoriesService,
    accounts as unknown as AccountsService,
    budgets as unknown as BudgetsService,
    analytics as unknown as AnalyticsService,
  );
  return { service, transactions, fx, categories, accounts, budgets, analytics };
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
    const txCreate = jest.fn().mockResolvedValue({ transaction: txView, budgetChange: null });
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

  it('query_analytics SUMMARY delegates to AnalyticsService.summary', async () => {
    const { service, analytics } = build();
    (analytics.summary as jest.Mock).mockResolvedValue({ totalExpenses: '1840', savingsRate: 42.5 });
    const result = await service.executeTool(
      workspace,
      'u1',
      call('query_analytics', { queryType: 'SUMMARY', fromDate: '2026-06-01', toDate: '2026-06-30' }),
    );
    expect(analytics.summary).toHaveBeenCalledWith('w1', 'USD', '2026-06-01', '2026-06-30');
    expect(result.toolResult).toContain('1840');
  });
});

describe('ChatService.handleMessage — LLM provider failure', () => {
  function buildForHandle(createMessage: jest.Mock) {
    const create = jest.fn().mockResolvedValue({ id: 'm', createdAt: new Date('2026-06-02T00:00:00Z') });
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ displayName: 'Aisha', timezone: 'UTC' }) },
      conversationMessage: {
        create,
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(2),
        updateMany: jest.fn(),
      },
      conversation: { update: jest.fn() },
    };
    const conversations = {
      requireConversation: jest.fn().mockResolvedValue({ id: 'c1', title: null }),
    };
    const llm = {
      getTools: jest.fn().mockReturnValue([]),
      buildSystemPrompt: jest.fn().mockReturnValue('sys'),
      createMessage,
    };
    const accounts = { list: jest.fn().mockResolvedValue([]) };
    const categories = { list: jest.fn().mockResolvedValue([]) };
    const budgets = { list: jest.fn().mockResolvedValue([]) };
    const analytics = {};
    const service = new ChatService(
      prisma as unknown as PrismaService,
      conversations as unknown as ConversationsService,
      llm as unknown as LlmService,
      {} as unknown as TransactionsService,
      {} as unknown as FxService,
      categories as unknown as CategoriesService,
      accounts as unknown as AccountsService,
      budgets as unknown as BudgetsService,
      analytics as unknown as AnalyticsService,
    );
    return { service, create };
  }

  it('throws 503 and persists a fallback assistant message when the LLM call fails', async () => {
    const createMessage = jest.fn().mockRejectedValue(new Error('credit balance too low'));
    const { service, create } = buildForHandle(createMessage);

    await expect(service.handleMessage(workspace, 'u1', 'c1', 'hi')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );

    const roles = create.mock.calls.map((c) => (c[0] as { data: { role: string } }).data.role);
    expect(roles).toContain('USER');
    expect(roles).toContain('ASSISTANT');
  });
});
