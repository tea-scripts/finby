import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AccountsService } from './accounts.service';

function buildPrisma() {
  return {
    account: {
      findMany: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
  };
}

const row = {
  id: 'a1',
  name: 'Wise USD',
  currency: 'USD',
  accountType: 'EWALLET',
  balance: new Prisma.Decimal('1200'),
  color: '#4A90D9',
  icon: 'wallet',
  isArchived: false,
};

describe('AccountsService', () => {
  it('create stores initialBalance as the opening balance and returns a string balance', async () => {
    const prisma = buildPrisma();
    prisma.account.create.mockResolvedValue(row);
    const service = new AccountsService(prisma as unknown as PrismaService);

    const result = await service.create('w1', {
      name: 'Wise USD',
      currency: 'USD',
      accountType: 'EWALLET',
      initialBalance: '1200',
      color: '#4A90D9',
      icon: 'wallet',
    });

    expect(prisma.account.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ workspaceId: 'w1', balance: '1200', currency: 'USD' }),
      }),
    );
    expect(result.balance).toBe('1200');
    expect(result.currency).toBe('USD');
  });

  it('update throws NotFound when the account is not in the workspace', async () => {
    const prisma = buildPrisma();
    prisma.account.findFirst.mockResolvedValue(null);
    const service = new AccountsService(prisma as unknown as PrismaService);
    await expect(service.update('w1', 'missing', { name: 'x' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.account.update).not.toHaveBeenCalled();
  });

  it('list maps rows to views', async () => {
    const prisma = buildPrisma();
    prisma.account.findMany.mockResolvedValue([row]);
    const service = new AccountsService(prisma as unknown as PrismaService);
    const result = await service.list('w1');
    expect(result).toHaveLength(1);
    expect(result[0]?.balance).toBe('1200');
  });
});
