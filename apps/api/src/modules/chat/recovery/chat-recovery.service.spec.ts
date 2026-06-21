import { Test } from '@nestjs/testing';
import { XpEvent } from '@prisma/client';
import { ChatRecoveryService } from './chat-recovery.service';
import { LlmService } from '../../llm/llm.service';

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

describe('ChatRecoveryService.restoreUserStreakAndXp', () => {
  let service: ChatRecoveryService;
  const prisma = {
    transaction: { findMany: jest.fn() },
    user: { findUnique: jest.fn(), update: jest.fn() },
    xpTransaction: { findMany: jest.fn() },
  };
  const xp = { awardXp: jest.fn().mockResolvedValue({}) };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        ChatRecoveryService,
        { provide: require('../../../prisma/prisma.service').PrismaService, useValue: prisma },
        { provide: require('../../llm/llm.service').LlmService, useValue: {} },
        { provide: require('../../transactions/transactions.service').TransactionsService, useValue: {} },
        { provide: require('../../categories/categories.service').CategoriesService, useValue: {} },
        { provide: require('../../accounts/accounts.service').AccountsService, useValue: {} },
        { provide: require('../../streaks/streaks.service').StreaksService, useValue: {} },
        { provide: require('../../gamification/xp.service').XpService, useValue: xp },
      ],
    }).compile();
    service = moduleRef.get(ChatRecoveryService);
  });

  it('recomputes streak and awards STREAK_DAY for a recovered date (commit)', async () => {
    // Active days incl. the recovered one (createdAt noon UTC → Manila same day):
    prisma.transaction.findMany.mockResolvedValue([
      { createdAt: new Date('2026-06-16T12:00:00Z') },
      { createdAt: new Date('2026-06-17T12:00:00Z') },
      { createdAt: new Date('2026-06-18T12:00:00Z') }, // recovered
    ]);
    prisma.user.findUnique.mockResolvedValue({ currentStreak: 2, longestStreak: 2 });
    prisma.xpTransaction.findMany.mockResolvedValue([]); // none awarded yet

    const res = await service.restoreUserStreakAndXp({
      userId: 'u1', tier: 'FREE', timezone: 'Asia/Manila',
      recoveredDates: ['2026-06-18'], commit: true,
    });

    expect(res.after.currentStreak).toBe(3);
    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'u1' },
      data: expect.objectContaining({ currentStreak: 3, longestStreak: 3, lastStreakDate: '2026-06-18' }),
    }));
    expect(res.xpAwards).toEqual([{ date: '2026-06-18', event: 'STREAK_DAY', delta: 1 }]);
    expect(xp.awardXp).toHaveBeenCalledWith('u1', 'FREE', XpEvent.STREAK_DAY, {
      date: '2026-06-18', source: 'chat-recovery',
    });
  });

  it('does not award XP for a recovered date already credited', async () => {
    prisma.transaction.findMany.mockResolvedValue([
      { createdAt: new Date('2026-06-18T12:00:00Z') },
    ]);
    prisma.user.findUnique.mockResolvedValue({ currentStreak: 0, longestStreak: 0 });
    prisma.xpTransaction.findMany.mockResolvedValue([
      { event: XpEvent.STREAK_DAY, meta: { date: '2026-06-18' } },
    ]);

    const res = await service.restoreUserStreakAndXp({
      userId: 'u1', tier: 'FREE', timezone: 'Asia/Manila',
      recoveredDates: ['2026-06-18'], commit: true,
    });
    expect(res.xpAwards).toEqual([]);
    expect(xp.awardXp).not.toHaveBeenCalled();
  });

  it('awards STREAK_MILESTONE when a recovered date completes a 7-day streak (commit)', async () => {
    // 7 consecutive days ending at the recovered date (noon UTC → same local day in Manila)
    prisma.transaction.findMany.mockResolvedValue([
      { createdAt: new Date('2026-06-12T12:00:00Z') },
      { createdAt: new Date('2026-06-13T12:00:00Z') },
      { createdAt: new Date('2026-06-14T12:00:00Z') },
      { createdAt: new Date('2026-06-15T12:00:00Z') },
      { createdAt: new Date('2026-06-16T12:00:00Z') },
      { createdAt: new Date('2026-06-17T12:00:00Z') },
      { createdAt: new Date('2026-06-18T12:00:00Z') }, // recovered
    ]);
    prisma.user.findUnique.mockResolvedValue({ currentStreak: 6, longestStreak: 6 });
    prisma.xpTransaction.findMany.mockResolvedValue([]); // nothing credited yet

    const res = await service.restoreUserStreakAndXp({
      userId: 'u1', tier: 'FREE', timezone: 'Asia/Manila',
      recoveredDates: ['2026-06-18'], commit: true,
    });

    expect(res.after.currentStreak).toBe(7);
    expect(xp.awardXp).toHaveBeenCalledWith('u1', 'FREE', XpEvent.STREAK_DAY, {
      date: '2026-06-18', source: 'chat-recovery',
    });
    expect(xp.awardXp).toHaveBeenCalledWith('u1', 'FREE', XpEvent.STREAK_MILESTONE, {
      date: '2026-06-18', source: 'chat-recovery',
    });
    expect(res.xpAwards).toEqual(expect.arrayContaining([
      { date: '2026-06-18', event: 'STREAK_DAY', delta: 1 },
      { date: '2026-06-18', event: 'STREAK_MILESTONE', delta: 5 },
    ]));
    expect(res.xpAwards).toHaveLength(2);
  });

  it('does not re-award STREAK_MILESTONE already credited', async () => {
    prisma.transaction.findMany.mockResolvedValue([
      { createdAt: new Date('2026-06-12T12:00:00Z') },
      { createdAt: new Date('2026-06-13T12:00:00Z') },
      { createdAt: new Date('2026-06-14T12:00:00Z') },
      { createdAt: new Date('2026-06-15T12:00:00Z') },
      { createdAt: new Date('2026-06-16T12:00:00Z') },
      { createdAt: new Date('2026-06-17T12:00:00Z') },
      { createdAt: new Date('2026-06-18T12:00:00Z') }, // recovered
    ]);
    prisma.user.findUnique.mockResolvedValue({ currentStreak: 6, longestStreak: 6 });
    prisma.xpTransaction.findMany.mockResolvedValue([
      { event: XpEvent.STREAK_DAY, meta: { date: '2026-06-18' } },
      { event: XpEvent.STREAK_MILESTONE, meta: { date: '2026-06-18' } },
    ]);

    const res = await service.restoreUserStreakAndXp({
      userId: 'u1', tier: 'FREE', timezone: 'Asia/Manila',
      recoveredDates: ['2026-06-18'], commit: true,
    });

    expect(xp.awardXp).not.toHaveBeenCalled();
    expect(res.xpAwards).toEqual([]);
  });

  it('writes nothing in dry-run but reports the planned changes', async () => {
    prisma.transaction.findMany.mockResolvedValue([
      { createdAt: new Date('2026-06-18T12:00:00Z') },
    ]);
    prisma.user.findUnique.mockResolvedValue({ currentStreak: 0, longestStreak: 0 });
    prisma.xpTransaction.findMany.mockResolvedValue([]);

    const res = await service.restoreUserStreakAndXp({
      userId: 'u1', tier: 'FREE', timezone: 'Asia/Manila',
      recoveredDates: ['2026-06-18'], commit: false,
    });
    expect(res.after.currentStreak).toBe(1);
    expect(res.xpAwards).toEqual([{ date: '2026-06-18', event: 'STREAK_DAY', delta: 1 }]);
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(xp.awardXp).not.toHaveBeenCalled();
  });
});
