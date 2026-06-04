import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ExportService } from './export.service';

describe('ExportService.exportPdf', () => {
  it('renders a non-empty PDF document buffer', async () => {
    const workspace = {
      id: 'w1',
      name: 'Test Workspace',
      slug: 'test-ws',
      tier: 'PRO',
      baseCurrency: 'USD',
    };
    const transactions = [
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
        merchant: 'SM, Makati',
        description: null,
        tags: ['food'],
      },
    ];
    const prisma = {
      workspace: { findUnique: jest.fn().mockResolvedValue(workspace) },
      transaction: { findMany: jest.fn().mockResolvedValue(transactions) },
    };
    const service = new ExportService(prisma as unknown as PrismaService);

    const pdf = await service.exportPdf('w1');

    expect(Buffer.isBuffer(pdf)).toBe(true);
    expect(pdf.length).toBeGreaterThan(0);
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });
});

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
