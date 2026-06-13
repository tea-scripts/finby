import { ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AccountsService } from '../accounts/accounts.service';
import { CategoriesService } from '../categories/categories.service';
import { FxService } from '../fx/fx.service';
import { LlmService } from '../llm/llm.service';
import { TransactionsService } from '../transactions/transactions.service';
import { BudgetsService } from '../budgets/budgets.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { MarketDataService } from '../market/market.service';
import { PortfolioService } from '../portfolio/portfolio.service';
import type { WorkspaceContext } from '../../common/context';
import type { LlmToolCall, LlmResponse, LlmStreamEvent } from '../llm/llm.types';
import { ChatService } from './chat.service';
import { ConversationsService } from './conversations.service';
import { MemoryCompressionService } from './memory/memory-compression.service';
import { ContextAssemblerService } from './context/context-assembler.service';

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
  accountCreate?: jest.Mock;
}) {
  const transactions = { create: overrides?.txCreate ?? jest.fn() };
  const fx = { getRate: overrides?.getRate ?? jest.fn() };
  const categories = { findByName: overrides?.findCategory ?? jest.fn().mockResolvedValue(null) };
  const accounts = {
    findByName: overrides?.findAccount ?? jest.fn().mockResolvedValue(null),
    create: overrides?.accountCreate ?? jest.fn(),
  };
  const budgets = { createOrUpdate: jest.fn(), list: jest.fn().mockResolvedValue([]) };
  const analytics = { summary: jest.fn(), byCategory: jest.fn(), trend: jest.fn(), topMerchants: jest.fn() };
  const market = { getQuote: jest.fn(), getOverview: jest.fn() };
  const portfolio = { logEvent: jest.fn(), getPortfolio: jest.fn() };
  const memory = { maintain: jest.fn().mockResolvedValue(undefined) };
  const contextAssembler = { buildContext: jest.fn().mockResolvedValue({ system: 'sys', messages: [] }) };
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
    market as unknown as MarketDataService,
    portfolio as unknown as PortfolioService,
    memory as unknown as MemoryCompressionService,
    contextAssembler as unknown as ContextAssemblerService,
  );
  return { service, transactions, fx, categories, accounts, budgets, analytics, market, portfolio };
}

function call(name: string, input: Record<string, unknown>): LlmToolCall {
  return { id: 't1', name, input };
}

/** Note: a response whose textOutput is empty yields no `text` delta — only the `complete` event. */
/** Builds an llm.streamMessage mock that, per call, yields the next response's
 *  text as a single delta then a `complete` event. Extra calls reuse the last. */
function streamOf(...responses: LlmResponse[]): jest.Mock {
  let i = 0;
  return jest.fn().mockImplementation((): AsyncIterable<LlmStreamEvent> => {
    const response = responses[Math.min(i++, responses.length - 1)] as LlmResponse;
    return (async function* (): AsyncGenerator<LlmStreamEvent> {
      if (response.textOutput) yield { type: 'text_delta', text: response.textOutput };
      yield { type: 'complete', response };
    })();
  });
}

/** An llm.streamMessage mock whose stream throws when iterated (connection failure). */
function streamThrows(error: Error): jest.Mock {
  return jest.fn().mockImplementation((): AsyncIterable<LlmStreamEvent> => {
    // eslint-disable-next-line require-yield
    return (async function* () {
      throw error;
    })();
  });
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

/** Harness for the LLM-provider-failure / rate-limit handleMessage paths.
 *  Shared by the JSON guard tests and the streamMessage event-sequence tests. */
function buildForHandle(streamMessage: jest.Mock, dailyCount = 2) {
  const create = jest.fn().mockResolvedValue({ id: 'm', createdAt: new Date('2026-06-02T00:00:00Z') });
  const prisma = {
    user: { findUnique: jest.fn().mockResolvedValue({ displayName: 'Aisha', timezone: 'UTC' }) },
    conversationMessage: {
      create,
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(dailyCount),
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
    streamMessage,
  };
  const accounts = { list: jest.fn().mockResolvedValue([]) };
  const categories = { list: jest.fn().mockResolvedValue([]) };
  const budgets = { list: jest.fn().mockResolvedValue([]) };
  const analytics = {};
  const memory = { maintain: jest.fn().mockResolvedValue(undefined) };
  const contextAssembler = { buildContext: jest.fn().mockResolvedValue({ system: 'sys', messages: [] }) };
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
    {} as unknown as MarketDataService,
    {} as unknown as PortfolioService,
    memory as unknown as MemoryCompressionService,
    contextAssembler as unknown as ContextAssemblerService,
  );
  return { service, create, memory, contextAssembler };
}

/** Harness for the memory.maintain tier-branching / text-only handleMessage paths. */
function buildForMaintain(streamMessage: jest.Mock) {
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
    streamMessage,
  };
  const accounts = { list: jest.fn().mockResolvedValue([]) };
  const categories = { list: jest.fn().mockResolvedValue([]) };
  const budgets = { list: jest.fn().mockResolvedValue([]) };
  const memory = { maintain: jest.fn().mockResolvedValue(undefined) };
  const contextAssembler = { buildContext: jest.fn().mockResolvedValue({ system: 'sys', messages: [] }) };
  const service = new ChatService(
    prisma as unknown as PrismaService,
    conversations as unknown as ConversationsService,
    llm as unknown as LlmService,
    {} as unknown as TransactionsService,
    {} as unknown as FxService,
    categories as unknown as CategoriesService,
    accounts as unknown as AccountsService,
    budgets as unknown as BudgetsService,
    {} as unknown as AnalyticsService,
    {} as unknown as MarketDataService,
    {} as unknown as PortfolioService,
    memory as unknown as MemoryCompressionService,
    contextAssembler as unknown as ContextAssemblerService,
  );
  return { service, memory };
}

/** Harness for the multi-step agentic tool loop (logs a transaction). Shared by
 *  the JSON loop guard tests and the streamMessage logging-turn test. */
function buildForLoop(streamMessage: jest.Mock) {
  const create = jest.fn().mockResolvedValue({ id: 'm', createdAt: new Date('2026-06-02T00:00:00Z') });
  const prisma = {
    user: { findUnique: jest.fn().mockResolvedValue({ displayName: 'Timi', timezone: 'UTC' }) },
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
    streamMessage,
  };
  const transactions = {
    create: jest.fn().mockResolvedValue({
      transaction: { ...txView, amountOriginal: '0.21', category: { id: 'c1', name: 'Dining' } },
      budgetChange: null,
    }),
  };
  const fx = { getRate: jest.fn().mockResolvedValue({ from: 'PHP', to: 'USD', rate: '0.0175' }) };
  const categories = {
    findByName: jest.fn().mockResolvedValue({ id: 'c1', name: 'Dining' }),
    list: jest.fn().mockResolvedValue([]),
  };
  const accounts = { findByName: jest.fn().mockResolvedValue(null), list: jest.fn().mockResolvedValue([]) };
  const budgets = { list: jest.fn().mockResolvedValue([]) };
  const memory = { maintain: jest.fn().mockResolvedValue(undefined) };
  const contextAssembler = { buildContext: jest.fn().mockResolvedValue({ system: 'sys', messages: [] }) };
  const service = new ChatService(
    prisma as unknown as PrismaService,
    conversations as unknown as ConversationsService,
    llm as unknown as LlmService,
    transactions as unknown as TransactionsService,
    fx as unknown as FxService,
    categories as unknown as CategoriesService,
    accounts as unknown as AccountsService,
    budgets as unknown as BudgetsService,
    {} as unknown as AnalyticsService,
    {} as unknown as MarketDataService,
    {} as unknown as PortfolioService,
    memory as unknown as MemoryCompressionService,
    contextAssembler as unknown as ContextAssemblerService,
  );
  return { service, transactions, fx, memory, contextAssembler };
}

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
    if (result.action?.type === 'TRANSACTION_CREATED') {
      expect(result.action.transactionId).toBe('tx1');
      expect(result.action.txType).toBe('EXPENSE');
    }
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

  it('get_market_data is blocked on FREE tier (Pro feature)', async () => {
    const { service, market } = build();
    const result = await service.executeTool(workspace, 'u1', call('get_market_data', { ticker: 'AAPL' }));
    expect(market.getQuote).not.toHaveBeenCalled();
    expect(result.toolResult).toContain('tier_limit');
  });

  it('get_market_data returns a quote on a PRO workspace', async () => {
    const { service, market } = build();
    (market.getQuote as jest.Mock).mockResolvedValue({ ticker: 'AAPL', price: '191.20' });
    const result = await service.executeTool(
      { ...workspace, tier: 'PRO' },
      'u1',
      call('get_market_data', { ticker: 'AAPL' }),
    );
    expect(market.getQuote).toHaveBeenCalledWith('AAPL');
    expect(result.toolResult).toContain('191.20');
  });

  it('log_investment_event logs a BUY on a PRO workspace', async () => {
    const { service, portfolio } = build();
    (portfolio.logEvent as jest.Mock).mockResolvedValue({
      holding: { ticker: 'AAPL', quantity: '5', avgCostBasis: '189', costCurrency: 'USD' },
      event: {},
    });
    const result = await service.executeTool(
      { ...workspace, tier: 'PRO' },
      'u1',
      call('log_investment_event', {
        ticker: 'AAPL',
        action: 'BUY',
        quantity: '5',
        pricePerUnit: '189',
        currency: 'USD',
        eventDate: '2026-05-28',
        confidence: 0.95,
      }),
    );
    expect(portfolio.logEvent).toHaveBeenCalledTimes(1);
    expect(result.toolResult).toContain('logged');
  });

  it('set_budget returns a BUDGET_SET action carrying only the currency', async () => {
    const { service, budgets, categories } = build();
    categories.findByName.mockResolvedValue({ id: 'c1', name: 'Groceries' });
    budgets.createOrUpdate.mockResolvedValue({
      category: { name: 'Groceries' },
      amountLimit: '300',
      currency: 'USD',
      period: 'MONTHLY',
      amountSpent: '0',
      utilizationPercent: 0,
    });

    const result = await service.executeTool(
      workspace,
      'u1',
      call('set_budget', { categoryName: 'Groceries', amountLimit: '300' }),
    );

    expect(result.action?.type).toBe('BUDGET_SET');
    if (result.action?.type === 'BUDGET_SET') {
      expect(result.action.preview.currency).toBe('USD');
    }
  });

  it('create_account creates an account and returns the created account', async () => {
    const accountCreate = jest.fn().mockResolvedValue({
      id: 'a1',
      name: 'GCash',
      currency: 'USD',
      accountType: 'EWALLET',
      balance: '5000',
      color: null,
      icon: null,
      isArchived: false,
    });
    const { service, accounts } = build({ accountCreate });

    const result = await service.executeTool(
      workspace,
      'u1',
      call('create_account', {
        name: 'GCash',
        accountType: 'EWALLET',
        currency: 'USD',
        openingBalance: '5000',
      }),
    );

    expect(accounts.create).toHaveBeenCalledWith(
      'w1',
      expect.objectContaining({
        name: 'GCash',
        accountType: 'EWALLET',
        currency: 'USD',
        initialBalance: '5000',
      }),
    );
    expect(result.toolResult).toContain('account_created');
    expect(result.toolResult).toContain('GCash');
  });

  it('create_account defaults the opening balance to 0 when omitted', async () => {
    const accountCreate = jest.fn().mockResolvedValue({
      id: 'a1',
      name: 'Cash',
      currency: 'USD',
      accountType: 'CASH',
      balance: '0',
      color: null,
      icon: null,
      isArchived: false,
    });
    const { service, accounts } = build({ accountCreate });

    await service.executeTool(
      workspace,
      'u1',
      call('create_account', { name: 'Cash', accountType: 'CASH', currency: 'USD' }),
    );

    expect(accounts.create).toHaveBeenCalledWith(
      'w1',
      expect.objectContaining({ initialBalance: '0' }),
    );
  });

  it('create_account in a non-base currency on FREE is blocked by the currency limit', async () => {
    const { service, accounts } = build();

    const result = await service.executeTool(
      workspace,
      'u1',
      call('create_account', { name: 'Wise', accountType: 'BANK', currency: 'EUR' }),
    );

    expect(accounts.create).not.toHaveBeenCalled();
    expect(result.toolResult).toContain('tier_limit');
  });

  it('create_account with an existing name does not create a duplicate', async () => {
    const findAccount = jest.fn().mockResolvedValue({ id: 'a1', name: 'GCash' });
    const { service, accounts } = build({ findAccount });

    const result = await service.executeTool(
      workspace,
      'u1',
      call('create_account', { name: 'GCash', accountType: 'EWALLET', currency: 'USD' }),
    );

    expect(accounts.create).not.toHaveBeenCalled();
    expect(result.toolResult).toContain('already');
  });

  it('create_account with missing required fields returns an error and does not create', async () => {
    const { service, accounts } = build();

    const result = await service.executeTool(
      workspace,
      'u1',
      call('create_account', { name: 'Nameless' }),
    );

    expect(accounts.create).not.toHaveBeenCalled();
    expect(result.toolResult).toContain('Missing');
  });
});

describe('ChatService.handleMessage — LLM provider failure', () => {
  it('blocks a FREE workspace that hit the daily message limit (429) before calling the LLM', async () => {
    const streamMessage = jest.fn();
    const { service } = buildForHandle(streamMessage, 20); // FREE cap = 20
    await expect(service.handleMessage(workspace, 'u1', 'c1', 'hi')).rejects.toMatchObject({
      response: { error: 'RATE_LIMITED' },
    });
    expect(streamMessage).not.toHaveBeenCalled();
  });

  it('throws 503 and persists a fallback assistant message when the LLM call fails', async () => {
    const streamMessage = streamThrows(new Error('credit balance too low'));
    const { service, create } = buildForHandle(streamMessage);

    await expect(service.handleMessage(workspace, 'u1', 'c1', 'hi')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );

    const roles = create.mock.calls.map((c) => (c[0] as { data: { role: string } }).data.role);
    expect(roles).toContain('USER');
    expect(roles).toContain('ASSISTANT');
  });
});

describe('ChatService.handleMessage — memory.maintain tier branching', () => {
  const successResponse: LlmResponse = {
    stopReason: 'end_turn',
    textOutput: 'Done.',
    content: [{ type: 'text' as const, text: 'Done.' }],
    toolCalls: [],
  };

  it('calls memory.maintain with (conversationId, "FREE") on a successful FREE-tier handleMessage', async () => {
    const streamMessage = streamOf(successResponse);
    const { service, memory } = buildForMaintain(streamMessage);

    await service.handleMessage(workspace, 'u1', 'c1', 'hello');

    expect(memory.maintain).toHaveBeenCalledWith('c1', 'FREE');
  });

  it('calls memory.maintain with (conversationId, "PRO") on a successful PRO-tier handleMessage', async () => {
    const streamMessage = streamOf(successResponse);
    const { service, memory } = buildForMaintain(streamMessage);

    await service.handleMessage({ ...workspace, tier: 'PRO' }, 'u1', 'c1', 'hello');

    expect(memory.maintain).toHaveBeenCalledWith('c1', 'PRO');
  });
});

describe('ChatService.handleMessage — multi-step tool loop', () => {
  function toolUse(name: string, input: Record<string, unknown>, id = 't1'): LlmResponse {
    return {
      stopReason: 'tool_use',
      textOutput: '',
      content: [{ type: 'tool_use' as const, id, name, input }],
      toolCalls: [{ id, name, input }],
    };
  }
  function finalText(text: string): LlmResponse {
    return {
      stopReason: 'end_turn',
      textOutput: text,
      content: [{ type: 'text' as const, text }],
      toolCalls: [],
    };
  }

  it('runs a second tool call (get_fx_rate then log_expense) and returns the action + final text', async () => {
    const streamMessage = streamOf(
      toolUse('get_fx_rate', { from: 'PHP', to: 'USD' }, 't1'),
      toolUse(
        'log_expense',
        { amountOriginal: '0.21', currencyOriginal: 'USD', categoryName: 'Dining', confidence: 0.95 },
        't2',
      ),
      finalText('Logged $0.21 for lunch.'),
    );
    const { service, transactions, fx } = buildForLoop(streamMessage);

    const result = await service.handleMessage(workspace, 'u1', 'c1', 'log that as USD');

    expect(fx.getRate).toHaveBeenCalled();
    expect(transactions.create).toHaveBeenCalledTimes(1);
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]?.type).toBe('TRANSACTION_CREATED');
    expect(result.message.content).toBe('Logged $0.21 for lunch.');
    expect(streamMessage).toHaveBeenCalledTimes(3);
  });

  it('never returns an empty assistant message even if the model ends with empty text', async () => {
    const streamMessage = streamOf(
      toolUse(
        'log_expense',
        { amountOriginal: '50', currencyOriginal: 'USD', categoryName: 'Dining', confidence: 0.95 },
        't1',
      ),
      finalText(''),
    );
    const { service } = buildForLoop(streamMessage);

    const result = await service.handleMessage(workspace, 'u1', 'c1', 'spent 50 on dinner');

    expect(result.actions).toHaveLength(1);
    expect(result.message.content.length).toBeGreaterThan(0);
  });

  function buildForDedup(streamMessage: jest.Mock) {
    const create = jest.fn().mockResolvedValue({ id: 'm', createdAt: new Date('2026-06-02T00:00:00Z') });
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ displayName: 'Timi', timezone: 'UTC' }) },
      conversationMessage: {
        create,
        findMany: jest.fn().mockResolvedValue([{ id: 'm0' }]),
        count: jest.fn().mockResolvedValue(2),
        updateMany: jest.fn(),
      },
      transaction: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { type: 'EXPENSE', amountOriginal: '12', currencyOriginal: 'USD', merchant: 'Lunch' },
          ]),
      },
      conversation: { update: jest.fn() },
    };
    const conversations = {
      requireConversation: jest.fn().mockResolvedValue({ id: 'c1', title: null }),
    };
    const llm = {
      getTools: jest.fn().mockReturnValue([]),
      buildSystemPrompt: jest.fn().mockReturnValue('sys'),
      streamMessage,
    };
    const transactions = { create: jest.fn() };
    const categories = {
      findByName: jest.fn().mockResolvedValue({ id: 'c1', name: 'Dining' }),
      list: jest.fn().mockResolvedValue([]),
    };
    const accounts = { findByName: jest.fn().mockResolvedValue(null), list: jest.fn().mockResolvedValue([]) };
    const budgets = { list: jest.fn().mockResolvedValue([]) };
    const memory = { maintain: jest.fn().mockResolvedValue(undefined) };
    const contextAssembler = { buildContext: jest.fn().mockResolvedValue({ system: 'sys', messages: [] }) };
    const service = new ChatService(
      prisma as unknown as PrismaService,
      conversations as unknown as ConversationsService,
      llm as unknown as LlmService,
      transactions as unknown as TransactionsService,
      {} as unknown as FxService,
      categories as unknown as CategoriesService,
      accounts as unknown as AccountsService,
      budgets as unknown as BudgetsService,
      {} as unknown as AnalyticsService,
      {} as unknown as MarketDataService,
      {} as unknown as PortfolioService,
      memory as unknown as MemoryCompressionService,
      contextAssembler as unknown as ContextAssemblerService,
    );
    return { service, transactions };
  }

  it('skips a log the model re-emits for an event already logged in this conversation', async () => {
    const streamMessage = streamOf(
      toolUse(
        'log_expense',
        { amountOriginal: '12', currencyOriginal: 'USD', merchant: 'Lunch', categoryName: 'Dining', confidence: 0.95 },
        't1',
      ),
      finalText('Your June budget is set.'),
    );
    const { service, transactions } = buildForDedup(streamMessage);

    const result = await service.handleMessage(workspace, 'u1', 'c1', 'set the same budget for June');

    // The re-emitted $12 Lunch matches an existing transaction in the conversation → skipped.
    expect(transactions.create).not.toHaveBeenCalled();
    expect(result.actions).toHaveLength(0);
    expect(result.message.content).toBe('Your June budget is set.');
  });
});

describe('ChatService.streamMessage — event sequence', () => {
  async function collect(gen: AsyncGenerator<import('./chat.types').ChatStreamEvent>) {
    const events: import('./chat.types').ChatStreamEvent[] = [];
    for await (const e of gen) events.push(e);
    return events;
  }

  it('text-only turn yields start, text, done (no action)', async () => {
    const streamMessage = streamOf({
      stopReason: 'end_turn',
      textOutput: 'You spent $42 this week.',
      content: [{ type: 'text', text: 'You spent $42 this week.' }],
      toolCalls: [],
    } as LlmResponse);
    const { service } = buildForMaintain(streamMessage);

    const events = await collect(service.streamMessage(workspace, 'u1', 'c1', 'how much?'));
    const types = events.map((e) => e.type);

    expect(types[0]).toBe('start');
    expect(types).toContain('text');
    expect(types[types.length - 1]).toBe('done');
    expect(types).not.toContain('action');
  });

  it('a logging turn yields start, action, text, done in order', async () => {
    const streamMessage = streamOf(
      {
        stopReason: 'tool_use',
        textOutput: '',
        content: [{ type: 'tool_use', id: 't1', name: 'log_expense', input: { amountOriginal: '0.21', currencyOriginal: 'USD', categoryName: 'Dining', confidence: 0.95 } }],
        toolCalls: [{ id: 't1', name: 'log_expense', input: { amountOriginal: '0.21', currencyOriginal: 'USD', categoryName: 'Dining', confidence: 0.95 } }],
      } as LlmResponse,
      { stopReason: 'end_turn', textOutput: 'Logged $0.21 for lunch.', content: [{ type: 'text', text: 'Logged $0.21 for lunch.' }], toolCalls: [] } as LlmResponse,
    );
    const { service } = buildForLoop(streamMessage);

    const events = await collect(service.streamMessage(workspace, 'u1', 'c1', 'spent 0.21 on lunch'));
    const types = events.map((e) => e.type);

    expect(types.indexOf('start')).toBeLessThan(types.indexOf('action'));
    expect(types.indexOf('action')).toBeLessThan(types.indexOf('text'));
    expect(types[types.length - 1]).toBe('done');
  });

  it('throws (for the controller to map to 503) when the first turn fails to connect', async () => {
    const streamMessage = streamThrows(new Error('credit balance too low'));
    const { service } = buildForHandle(streamMessage);
    await expect(collect(service.streamMessage(workspace, 'u1', 'c1', 'hi'))).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('a follow-up failure after a commit yields action then error, still ending with done', async () => {
    const toolTurn = {
      stopReason: 'tool_use',
      textOutput: '',
      content: [{ type: 'tool_use', id: 't1', name: 'log_expense', input: { amountOriginal: '0.21', currencyOriginal: 'USD', categoryName: 'Dining', confidence: 0.95 } }],
      toolCalls: [{ id: 't1', name: 'log_expense', input: { amountOriginal: '0.21', currencyOriginal: 'USD', categoryName: 'Dining', confidence: 0.95 } }],
    } as LlmResponse;
    let nth = 0;
    const streamMessage = jest.fn().mockImplementation((): AsyncIterable<LlmStreamEvent> => {
      const turn = nth++;
      return (async function* () {
        if (turn === 0) {
          yield { type: 'complete', response: toolTurn };
        } else {
          throw new Error('overloaded');
        }
      })();
    });
    const { service } = buildForLoop(streamMessage);

    const events = await collect(service.streamMessage(workspace, 'u1', 'c1', 'spent 0.21 on lunch'));
    const types = events.map((e) => e.type);

    expect(types).toContain('action');
    expect(types.indexOf('error')).toBeGreaterThan(types.indexOf('action'));
    const done = events[events.length - 1]!;
    expect(done.type).toBe('done');
    if (done.type === 'done') expect(done.message.content.length).toBeGreaterThan(0);
  });
});
