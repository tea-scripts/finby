import { Test } from '@nestjs/testing';
import { ChatRecoveryService } from './chat-recovery.service';
import { LlmService } from '../../llm/llm.service';
// plus the other injected services — provide jest-mock objects for each.

describe('ChatRecoveryService.reconstructTurn', () => {
  let service: ChatRecoveryService;
  const llm = {
    buildSystemPrompt: jest.fn().mockReturnValue('SYS'),
    getTools: jest.fn().mockReturnValue([]),
    createMessage: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        ChatRecoveryService,
        { provide: LlmService, useValue: llm },
        // Provide the remaining deps as empty mocks (PrismaService,
        // TransactionsService, CategoriesService, AccountsService,
        // StreaksService, XpService) — reconstructTurn only uses llm.
        { provide: require('../../../prisma/prisma.service').PrismaService, useValue: {} },
        { provide: require('../../transactions/transactions.service').TransactionsService, useValue: {} },
        { provide: require('../../categories/categories.service').CategoriesService, useValue: {} },
        { provide: require('../../accounts/accounts.service').AccountsService, useValue: {} },
        { provide: require('../../streaks/streaks.service').StreaksService, useValue: {} },
        { provide: require('../../gamification/xp.service').XpService, useValue: {} },
      ],
    }).compile();
    service = moduleRef.get(ChatRecoveryService);
  });

  const baseInput = {
    workspace: { id: 'w1', baseCurrency: 'USD', tier: 'FREE' as const },
    user: { displayName: 'Tim', timezone: 'Asia/Manila' },
    accounts: [], categories: ['Transport'],
    userText: 'Spent 1000₱ on gas today',
    messageLocalDate: '2026-06-18',
  };

  it('returns a reconstructed expense from a log_expense tool call', async () => {
    llm.createMessage.mockResolvedValue({
      toolCalls: [{ name: 'log_expense', input: {
        amountOriginal: '1000', currencyOriginal: 'PHP', categoryName: 'Transport',
        merchant: 'gas', confidence: 0.95,
      } }],
    });
    const r = await service.reconstructTurn(baseInput);
    expect(r).toMatchObject({
      type: 'EXPENSE', amountOriginal: '1000', currencyOriginal: 'PHP',
      categoryName: 'Transport', merchant: 'gas', transactionDate: '2026-06-18',
      needsManual: false,
    });
    // "today" was pinned to the message's local date, not the real today.
    expect(llm.buildSystemPrompt).toHaveBeenCalledWith(
      expect.objectContaining({ today: '2026-06-18' }),
    );
  });

  it('returns null when no log tool was called (not a logging intent)', async () => {
    llm.createMessage.mockResolvedValue({ toolCalls: [] });
    expect(await service.reconstructTurn(baseInput)).toBeNull();
  });

  it('marks a transfer as needsManual', async () => {
    llm.createMessage.mockResolvedValue({
      toolCalls: [{ name: 'log_transfer', input: {
        amountOriginal: '500', currencyOriginal: 'PHP', confidence: 0.9,
      } }],
    });
    const r = await service.reconstructTurn(baseInput);
    expect(r).toMatchObject({ type: 'TRANSFER', needsManual: true });
  });

  it('falls back to the message local date when the tool omits transactionDate', async () => {
    llm.createMessage.mockResolvedValue({
      toolCalls: [{ name: 'log_income', input: {
        amountOriginal: '2000', currencyOriginal: 'USD', confidence: 1,
      } }],
    });
    const r = await service.reconstructTurn(baseInput);
    expect(r).toMatchObject({ type: 'INCOME', transactionDate: '2026-06-18' });
  });
});
