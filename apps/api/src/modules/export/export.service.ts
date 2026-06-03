import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

function csvCell(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const TX_HEADER = [
  'transactionDate',
  'type',
  'status',
  'amountOriginal',
  'currencyOriginal',
  'amountBase',
  'currencyBase',
  'category',
  'account',
  'merchant',
  'description',
  'tags',
];

@Injectable()
export class ExportService {
  constructor(private readonly prisma: PrismaService) {}

  async exportTransactionsCsv(workspaceId: string): Promise<string> {
    const rows = await this.prisma.transaction.findMany({
      where: { workspaceId },
      include: { category: { select: { name: true } }, fromAccount: { select: { name: true } } },
      orderBy: { transactionDate: 'desc' },
    });

    const lines = [TX_HEADER.join(',')];
    for (const t of rows) {
      lines.push(
        [
          t.transactionDate.toISOString().slice(0, 10),
          t.type,
          t.status,
          t.amountOriginal.toString(),
          t.currencyOriginal,
          t.amountBase.toString(),
          t.currencyBase,
          t.category?.name ?? '',
          t.fromAccount?.name ?? '',
          t.merchant ?? '',
          t.description ?? '',
          t.tags.join('|'),
        ]
          .map(csvCell)
          .join(','),
      );
    }
    return lines.join('\n');
  }

  async exportJson(workspaceId: string): Promise<Record<string, unknown>> {
    const [workspace, accounts, categories, transactions, budgets, holdings] = await Promise.all([
      this.prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { id: true, name: true, slug: true, tier: true, baseCurrency: true },
      }),
      this.prisma.account.findMany({ where: { workspaceId } }),
      this.prisma.category.findMany({ where: { workspaceId } }),
      this.prisma.transaction.findMany({ where: { workspaceId }, orderBy: { transactionDate: 'desc' } }),
      this.prisma.budget.findMany({ where: { workspaceId } }),
      this.prisma.portfolioHolding.findMany({ where: { workspaceId } }),
    ]);

    return {
      exportedAt: new Date().toISOString(),
      workspace,
      accounts,
      categories,
      transactions,
      budgets,
      holdings,
    };
  }
}
