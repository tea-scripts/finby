import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ExportService } from './export.service';

describe('ExportService.exportTransactionsCsv', () => {
  it('produces a header row + escaped data rows', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        transactionDate: new Date('2026-06-03T00:00:00.000Z'),
        type: 'EXPENSE',
        status: 'CONFIRMED',
        amountOriginal: new Prisma.Decimal('2200'),
        currencyOriginal: 'PHP',
        amountBase: new Prisma.Decimal('38.5'),
        currencyBase: 'USD',
        category: { name: 'Groceries' },
        fromAccount: { name: 'BDO' },
        merchant: 'SM, Makati', // comma -> must be quoted
        description: null,
        tags: ['food', 'weekly'],
      },
    ]);
    const prisma = { transaction: { findMany } };
    const service = new ExportService(prisma as unknown as PrismaService);

    const csv = await service.exportTransactionsCsv('w1');
    const lines = csv.split('\n');

    expect(lines[0]).toBe(
      'transactionDate,type,status,amountOriginal,currencyOriginal,amountBase,currencyBase,category,account,merchant,description,tags',
    );
    expect(lines[1]).toContain('2026-06-03,EXPENSE,CONFIRMED,2200,PHP,38.5,USD,Groceries,BDO,"SM, Makati",,food|weekly');
  });
});
