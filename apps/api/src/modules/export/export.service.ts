import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { PrismaService } from '../../prisma/prisma.service';

function csvCell(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Pad/truncate to a fixed width so Courier columns line up in the PDF. */
function pad(value: string, width: number): string {
  if (value.length > width) return `${value.slice(0, width - 1)}…`;
  return value.padEnd(width);
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

  /** A printable financial statement: header, totals, and a transactions
   *  table. Returns the rendered PDF as a Buffer. */
  async exportPdf(workspaceId: string): Promise<Buffer> {
    const [workspace, rows] = await Promise.all([
      this.prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { id: true, name: true, slug: true, tier: true, baseCurrency: true },
      }),
      this.prisma.transaction.findMany({
        where: { workspaceId },
        include: { category: { select: { name: true } }, fromAccount: { select: { name: true } } },
        orderBy: { transactionDate: 'desc' },
      }),
    ]);

    const currency = workspace?.baseCurrency ?? '';
    let income = 0;
    let expense = 0;
    for (const t of rows) {
      const base = Number(t.amountBase);
      if (t.type === 'INCOME') income += base;
      else if (t.type === 'EXPENSE') expense += base;
    }

    return this.renderPdf((doc) => {
      doc.fontSize(22).fillColor('#1d6ef5').text('Finby');
      doc.fontSize(14).fillColor('#06101f').text('Financial Statement');
      doc.moveDown(0.5);
      doc
        .fontSize(10)
        .fillColor('#555555')
        .text(`Workspace: ${workspace?.name ?? workspaceId}`)
        .text(`Base currency: ${currency || '—'}`)
        .text(`Generated: ${new Date().toISOString().slice(0, 10)}`);

      doc.moveDown();
      doc
        .fontSize(11)
        .fillColor('#06101f')
        .text(`Transactions: ${rows.length}`)
        .text(`Total income: ${income.toFixed(2)} ${currency}`)
        .text(`Total expense: ${expense.toFixed(2)} ${currency}`)
        .text(`Net: ${(income - expense).toFixed(2)} ${currency}`);

      doc.moveDown();
      const header =
        pad('Date', 12) + pad('Type', 9) + pad('Amount', 16) + pad('Category', 16) + 'Merchant';
      doc.font('Courier-Bold').fontSize(9).fillColor('#888888').text(header);
      doc.font('Courier').fillColor('#06101f');
      for (const t of rows) {
        const line =
          pad(t.transactionDate.toISOString().slice(0, 10), 12) +
          pad(t.type, 9) +
          pad(`${t.amountBase.toString()} ${t.currencyBase}`, 16) +
          pad(t.category?.name ?? '', 16) +
          (t.merchant ?? '');
        doc.text(line);
      }

      if (rows.length === 0) {
        doc.font('Helvetica').fillColor('#888888').text('No transactions yet.');
      }
    });
  }

  /** Run a pdfkit build function and resolve the document as a Buffer. */
  private renderPdf(build: (doc: PDFKit.PDFDocument) => void): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 48 });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      build(doc);
      doc.end();
    });
  }
}
