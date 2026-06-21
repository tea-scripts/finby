import { Test } from '@nestjs/testing';
import { XpEvent } from '@prisma/client';
import { ChatRecoveryService } from './chat-recovery.service';
import { LlmService } from '../../llm/llm.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { TransactionsService } from '../../transactions/transactions.service';
import { CategoriesService } from '../../categories/categories.service';
import { AccountsService } from '../../accounts/accounts.service';
import { StreaksService } from '../../streaks/streaks.service';
import { XpService } from '../../gamification/xp.service';

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
        { provide: PrismaService, useValue: {} },
        { provide: TransactionsService, useValue: {} },
        { provide: CategoriesService, useValue: {} },
        { provide: AccountsService, useValue: {} },
        { provide: StreaksService, useValue: {} },
        { provide: XpService, useValue: {} },
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
        { provide: PrismaService, useValue: prisma },
        { provide: LlmService, useValue: {} },
        { provide: TransactionsService, useValue: {} },
        { provide: CategoriesService, useValue: {} },
        { provide: AccountsService, useValue: {} },
        { provide: StreaksService, useValue: {} },
        { provide: XpService, useValue: xp },
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

  it('never lowers currentStreak when recompute is shorter than live streak (C1)', async () => {
    // Only 2 active days — recompute would yield streak=2, but live streak is 15.
    prisma.transaction.findMany.mockResolvedValue([
      { createdAt: new Date('2026-06-17T12:00:00Z') },
      { createdAt: new Date('2026-06-18T12:00:00Z') },
    ]);
    prisma.user.findUnique.mockResolvedValue({
      currentStreak: 15,
      longestStreak: 15,
      lastStreakDate: '2026-06-18',
      lastStreakRepairDate: null,
    });
    prisma.xpTransaction.findMany.mockResolvedValue([]);

    const res = await service.restoreUserStreakAndXp({
      userId: 'u1', tier: 'FREE', timezone: 'Asia/Manila',
      recoveredDates: ['2026-06-18'], commit: true,
    });

    expect(res.after.currentStreak).toBe(15);
    expect(res.after.longestStreak).toBe(15);
    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'u1' },
      data: expect.objectContaining({ currentStreak: 15, longestStreak: 15 }),
    }));
  });

  it('folds lastStreakRepairDate into active set to bridge gap (C1)', async () => {
    // Two separate runs: Jun 10-12, then Jun 14-15. Gap is Jun 13.
    // lastStreakRepairDate = '2026-06-13' bridges the gap → bridged streak = 6.
    prisma.transaction.findMany.mockResolvedValue([
      { createdAt: new Date('2026-06-10T12:00:00Z') },
      { createdAt: new Date('2026-06-11T12:00:00Z') },
      { createdAt: new Date('2026-06-12T12:00:00Z') },
      { createdAt: new Date('2026-06-14T12:00:00Z') },
      { createdAt: new Date('2026-06-15T12:00:00Z') },
    ]);
    prisma.user.findUnique.mockResolvedValue({
      currentStreak: 2,
      longestStreak: 3,
      lastStreakDate: '2026-06-15',
      lastStreakRepairDate: '2026-06-13',
    });
    prisma.xpTransaction.findMany.mockResolvedValue([]);

    const res = await service.restoreUserStreakAndXp({
      userId: 'u1', tier: 'FREE', timezone: 'Asia/Manila',
      recoveredDates: ['2026-06-15'], commit: false,
    });

    // With bridge date folded in: 10,11,12,13,14,15 → 6-day run
    expect(res.after.currentStreak).toBe(6);
    expect(res.after.longestStreak).toBe(6);
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

describe('ChatRecoveryService.run', () => {
  let service: ChatRecoveryService;

  // Mock prisma with all methods the run() flow touches
  const prisma = {
    conversation: { findMany: jest.fn() },
    workspace: { findUnique: jest.fn() },
    user: { findUnique: jest.fn(), update: jest.fn() },
    account: { findMany: jest.fn() },
    category: { findMany: jest.fn() },
    transaction: { findMany: jest.fn() },
    xpTransaction: { findMany: jest.fn() },
  };
  const transactionsMock = { create: jest.fn() };
  const categoriesMock = { findByName: jest.fn() };
  const accountsMock = { findByName: jest.fn() };
  const llmMock = {
    buildSystemPrompt: jest.fn().mockReturnValue('SYS'),
    getTools: jest.fn().mockReturnValue([]),
    createMessage: jest.fn(),
  };
  const xpMock = { awardXp: jest.fn().mockResolvedValue({}) };

  // One dropped turn: user msg with no downstream TOOL_RESULT+createdTransactionId
  const userMsgId = 'umsg-1';
  const convoId = 'conv-1';
  const userId = 'user-1';
  const workspaceId = 'ws-1';

  const makeConversation = () => ({
    id: convoId,
    userId,
    workspaceId,
    messages: [
      {
        id: userMsgId,
        role: 'USER',
        content: 'Spent 100 USD on food',
        toolName: null,
        createdTransactionId: null,
        createdAt: new Date('2026-06-16T12:00:00.000Z'),
      },
      // No TOOL_CALL/TOOL_RESULT follow-ups → dropped turn
    ],
  });

  beforeEach(async () => {
    jest.clearAllMocks();

    // Default: one conversation with one dropped turn
    prisma.conversation.findMany.mockResolvedValue([makeConversation()]);
    prisma.workspace.findUnique.mockResolvedValue({ tier: 'FREE', baseCurrency: 'USD' });
    prisma.user.findUnique.mockResolvedValue({
      displayName: 'Tim',
      timezone: 'UTC',
      currentStreak: 0,
      longestStreak: 0,
    });
    prisma.account.findMany.mockResolvedValue([{ name: 'Cash', currency: 'USD' }]);
    prisma.category.findMany.mockResolvedValue([{ name: 'Food' }]);
    prisma.transaction.findMany.mockResolvedValue([]);
    prisma.xpTransaction.findMany.mockResolvedValue([]);
    prisma.user.update.mockResolvedValue({});

    transactionsMock.create.mockResolvedValue({ transaction: { id: 'tx1' } });
    categoriesMock.findByName.mockResolvedValue({ id: 'cat-1', name: 'Food' });
    accountsMock.findByName.mockResolvedValue({ id: 'acc-1', name: 'Cash' });

    // LLM reconstructs an EXPENSE
    llmMock.createMessage.mockResolvedValue({
      toolCalls: [{
        name: 'log_expense',
        input: {
          amountOriginal: '100',
          currencyOriginal: 'USD',
          categoryName: 'Food',
          accountName: 'Cash',
          transactionDate: '2026-06-16',
          confidence: 0.95,
        },
      }],
    });

    const moduleRef = await Test.createTestingModule({
      providers: [
        ChatRecoveryService,
        { provide: PrismaService, useValue: prisma },
        { provide: LlmService, useValue: llmMock },
        { provide: TransactionsService, useValue: transactionsMock },
        { provide: CategoriesService, useValue: categoriesMock },
        { provide: AccountsService, useValue: accountsMock },
        { provide: StreaksService, useValue: {} },
        { provide: XpService, useValue: xpMock },
      ],
    }).compile();
    service = moduleRef.get(ChatRecoveryService);
  });

  it('dry-run reconstructs and reports without writing', async () => {
    // Provide a transaction row so restoreUserStreakAndXp sees an active day
    prisma.transaction.findMany.mockImplementation((args: { where?: { loggedByUserId?: string; sourceMessageId?: { in?: string[] } } } | undefined) => {
      if (args?.where?.loggedByUserId) {
        return Promise.resolve([{ createdAt: new Date('2026-06-16T12:00:00.000Z') }]);
      }
      // idempotency check (sourceMessageId)
      return Promise.resolve([]);
    });

    const report = await service.run({ since: '2026-06-15', commit: false });
    expect(report.commit).toBe(false);
    expect(report.candidates).toBe(1);
    expect(report.inserted).toHaveLength(1);
    expect(transactionsMock.create).not.toHaveBeenCalled();
    expect(report.streakRestores[0]!.after.currentStreak).toBeGreaterThanOrEqual(1);
  });

  it('commit inserts the transaction with recovery markers', async () => {
    // Allow transaction.findMany to return empty (no prior recovery) for idempotency check
    // and provide the active-day row for streak restore
    prisma.transaction.findMany.mockImplementation((args: { where?: { loggedByUserId?: string; sourceMessageId?: { in?: string[] } } } | undefined) => {
      if (args?.where?.loggedByUserId) {
        return Promise.resolve([{ createdAt: new Date('2026-06-16T12:00:00.000Z') }]);
      }
      return Promise.resolve([]);
    });

    const report = await service.run({ since: '2026-06-15', commit: true });
    expect(transactionsMock.create).toHaveBeenCalledWith(expect.objectContaining({
      skipEngagement: true,
      sourceMessageId: expect.any(String),
      tags: ['chat-recovery'],
      status: 'CONFIRMED',
    }));
    expect(report.inserted).toHaveLength(1);
  });

  it('re-entrant restore: covers prior-run orphans even when no new turns detected (I1)', async () => {
    // detectDroppedTurns finds NO new turns (conversation has no dropped turns).
    // But transaction.findMany for tags.has('chat-recovery') returns a prior-run
    // recovery txn for user-2. Expect restoreUserStreakAndXp to be called for user-2.
    const orphanUserId = 'user-2';
    const orphanWorkspaceId = 'ws-2';

    prisma.conversation.findMany.mockResolvedValue([]); // no conversations with dropped turns

    // Discriminate all three types of transaction.findMany calls:
    //   1. idempotency: where.sourceMessageId.in  → []
    //   2. re-entrant:  where.tags.has            → prior-run txn for orphanUserId
    //   3. streak:      where.loggedByUserId       → active day for orphanUserId
    prisma.transaction.findMany.mockImplementation((args: {
      where?: {
        loggedByUserId?: string;
        sourceMessageId?: { in?: string[] };
        tags?: { has?: string };
      };
    } | undefined) => {
      if (args?.where?.tags?.has === 'chat-recovery') {
        return Promise.resolve([{
          loggedByUserId: orphanUserId,
          createdAt: new Date('2026-06-16T12:00:00.000Z'),
          workspaceId: orphanWorkspaceId,
        }]);
      }
      if (args?.where?.loggedByUserId === orphanUserId) {
        return Promise.resolve([{ createdAt: new Date('2026-06-16T12:00:00.000Z') }]);
      }
      return Promise.resolve([]);
    });

    prisma.workspace.findUnique.mockImplementation((args: { where?: { id?: string } } | undefined) => {
      if (args?.where?.id === orphanWorkspaceId) {
        return Promise.resolve({ tier: 'FREE', baseCurrency: 'USD' });
      }
      return Promise.resolve({ tier: 'FREE', baseCurrency: 'USD' });
    });

    prisma.user.findUnique.mockImplementation((args: { where?: { id?: string } } | undefined) => {
      if (args?.where?.id === orphanUserId) {
        return Promise.resolve({
          displayName: 'Orphan',
          timezone: 'UTC',
          currentStreak: 0,
          longestStreak: 0,
          lastStreakDate: null,
          lastStreakRepairDate: null,
        });
      }
      return Promise.resolve({
        displayName: 'Tim',
        timezone: 'UTC',
        currentStreak: 0,
        longestStreak: 0,
        lastStreakDate: null,
        lastStreakRepairDate: null,
      });
    });

    prisma.xpTransaction.findMany.mockResolvedValue([]);

    const restoreSpy = jest.spyOn(service, 'restoreUserStreakAndXp');

    const report = await service.run({ since: '2026-06-15', commit: true });

    // The re-entrant phase must call restoreUserStreakAndXp for orphanUserId
    expect(restoreSpy).toHaveBeenCalledWith(expect.objectContaining({
      userId: orphanUserId,
      commit: true,
    }));
    expect(report.streakRestores.some((r) => r.userId === orphanUserId)).toBe(true);
  });

  it('isolates per-turn failures: failed turn is recorded, second turn still processed', async () => {
    const userMsgId2 = 'umsg-2';

    // Two dropped turns in the same conversation
    prisma.conversation.findMany.mockResolvedValue([{
      id: convoId,
      userId,
      workspaceId,
      messages: [
        {
          id: userMsgId,
          role: 'USER',
          content: 'Spent 50 USD on coffee',
          toolName: null,
          createdTransactionId: null,
          createdAt: new Date('2026-06-16T12:00:00.000Z'),
        },
        {
          id: userMsgId2,
          role: 'USER',
          content: 'Spent 100 USD on food',
          toolName: null,
          createdTransactionId: null,
          createdAt: new Date('2026-06-16T13:00:00.000Z'),
        },
      ],
    }]);

    prisma.transaction.findMany.mockImplementation((args: { where?: { loggedByUserId?: string; sourceMessageId?: { in?: string[] } } } | undefined) => {
      if (args?.where?.loggedByUserId) {
        return Promise.resolve([{ createdAt: new Date('2026-06-16T12:00:00.000Z') }]);
      }
      return Promise.resolve([]);
    });

    // First call to transactions.create rejects; second resolves
    transactionsMock.create
      .mockRejectedValueOnce(new Error('DB write failed'))
      .mockResolvedValueOnce({ transaction: { id: 'tx2' } });

    const report = await service.run({ since: '2026-06-15', commit: true });

    // run() must not reject
    expect(report.failed).toHaveLength(1);
    expect(report.failed[0]).toMatchObject({
      userId,
      conversationId: convoId,
      userMessageId: userMsgId,
      error: 'DB write failed',
    });
    // Second turn was still processed and inserted
    expect(report.inserted).toHaveLength(1);
    expect(report.inserted[0]!.userMessageId).toBe(userMsgId2);
  });
});
