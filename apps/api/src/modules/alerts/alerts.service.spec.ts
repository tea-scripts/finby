import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AlertsService, crossedBudgetThreshold } from './alerts.service';
import type { BudgetSpendChange } from '../budgets/budgets.types';

function change(prev: number, next: number): BudgetSpendChange {
  return {
    budgetId: 'b1',
    categoryName: 'Dining',
    amountLimit: '8000',
    previousSpent: '0',
    newSpent: '0',
    previousPercent: prev,
    newPercent: next,
  };
}

describe('crossedBudgetThreshold', () => {
  it('detects the highest threshold newly crossed upward', () => {
    expect(crossedBudgetThreshold(60, 76)).toBe('BUDGET_75_PERCENT');
    expect(crossedBudgetThreshold(80, 92)).toBe('BUDGET_90_PERCENT');
    expect(crossedBudgetThreshold(95, 105)).toBe('BUDGET_EXCEEDED');
    expect(crossedBudgetThreshold(10, 99)).toBe('BUDGET_90_PERCENT');
  });

  it('returns null when no new threshold is crossed', () => {
    expect(crossedBudgetThreshold(40, 60)).toBeNull();
    expect(crossedBudgetThreshold(76, 80)).toBeNull();
    expect(crossedBudgetThreshold(100, 50)).toBeNull(); // reversal
  });
});

describe('AlertsService.generateBudgetAlert', () => {
  it('creates an alert when a threshold is crossed', async () => {
    const create = jest.fn().mockResolvedValue({
      id: 'a1',
      type: 'BUDGET_75_PERCENT',
      status: 'UNREAD',
      title: 'Dining budget at 75%',
      body: '...',
      createdAt: new Date('2026-06-02T00:00:00Z'),
    });
    const prisma = { alert: { create } };
    const service = new AlertsService(prisma as unknown as PrismaService);

    const result = await service.generateBudgetAlert({
      workspaceId: 'w1',
      userId: 'u1',
      budgetId: 'b1',
      categoryId: 'c1',
      change: change(60, 78),
    });

    expect(create).toHaveBeenCalledTimes(1);
    const arg = create.mock.calls[0]?.[0] as { data: { type: string; userId: string } };
    expect(arg.data.type).toBe('BUDGET_75_PERCENT');
    expect(arg.data.userId).toBe('u1');
    expect(result?.type).toBe('BUDGET_75_PERCENT');
  });

  it('returns null and creates nothing when no threshold crossed', async () => {
    const create = jest.fn();
    const prisma = { alert: { create } };
    const service = new AlertsService(prisma as unknown as PrismaService);
    const result = await service.generateBudgetAlert({
      workspaceId: 'w1',
      userId: 'u1',
      budgetId: 'b1',
      change: change(40, 60),
    });
    expect(result).toBeNull();
    expect(create).not.toHaveBeenCalled();
  });
});

describe('AlertsService.list', () => {
  it('returns alerts plus the unread count', async () => {
    const findMany = jest.fn().mockResolvedValue([
      { id: 'a1', type: 'BUDGET_75_PERCENT', status: 'UNREAD', title: 't', body: 'b', createdAt: new Date() },
    ]);
    const count = jest.fn().mockResolvedValue(3);
    const prisma = { alert: { findMany, count } };
    const service = new AlertsService(prisma as unknown as PrismaService);

    const result = await service.list('w1', 'u1', { limit: 20 });
    expect(result.alerts).toHaveLength(1);
    expect(result.unreadCount).toBe(3);
    expect(count).toHaveBeenCalledWith({ where: { workspaceId: 'w1', userId: 'u1', status: 'UNREAD' } });
  });
});

describe('AlertsService.updateStatus', () => {
  it('throws NotFound when the alert is not the user’s', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const prisma = { alert: { findFirst, update: jest.fn() } };
    const service = new AlertsService(prisma as unknown as PrismaService);
    await expect(
      service.updateStatus('w1', 'u1', 'missing', { status: 'READ' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('sets readAt when marking READ', async () => {
    const findFirst = jest.fn().mockResolvedValue({ id: 'a1' });
    const update = jest.fn().mockResolvedValue({
      id: 'a1',
      type: 'BUDGET_75_PERCENT',
      status: 'READ',
      title: 't',
      body: 'b',
      createdAt: new Date(),
    });
    const prisma = { alert: { findFirst, update } };
    const service = new AlertsService(prisma as unknown as PrismaService);
    await service.updateStatus('w1', 'u1', 'a1', { status: 'READ' });
    const arg = update.mock.calls[0]?.[0] as { data: { status: string; readAt: Date } };
    expect(arg.data.status).toBe('READ');
    expect(arg.data.readAt).toBeInstanceOf(Date);
  });
});
