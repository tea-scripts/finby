import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { isCurrencyCode } from '@finby/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { FxService } from '../fx/fx.service';

export interface UpdateBaseCurrencyResult {
  baseCurrency: string;
  preferredCurrencies: string[];
  recomputed: number;
}

interface TxRow {
  id: string;
  amountOriginal: Prisma.Decimal;
  currencyOriginal: string;
  transactionDate: Date;
  type: string;
  status: string;
  categoryId: string | null;
}

@Injectable()
export class BaseCurrencyService {
  private readonly logger = new Logger(BaseCurrencyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly fx: FxService,
  ) {}

  async updateBaseCurrency(
    workspaceId: string,
    rawNewBase: string,
  ): Promise<UpdateBaseCurrencyResult> {
    const newBase = rawNewBase.toUpperCase();
    if (!isCurrencyCode(newBase)) {
      throw new BadRequestException(`Unknown currency: ${newBase}`);
    }

    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { baseCurrency: true, preferredCurrencies: true },
    });
    if (!workspace) throw new NotFoundException('Workspace not found.');

    const oldBase = workspace.baseCurrency.toUpperCase();
    if (oldBase === newBase) {
      return {
        baseCurrency: oldBase,
        preferredCurrencies: workspace.preferredCurrencies,
        recomputed: 0,
      };
    }

    const [transactions, events] = await Promise.all([
      this.prisma.transaction.findMany({
        where: { workspaceId, status: { not: 'VOID' } },
        select: {
          id: true,
          amountOriginal: true,
          currencyOriginal: true,
          transactionDate: true,
          type: true,
          status: true,
          categoryId: true,
        },
      }),
      this.prisma.investmentEvent.findMany({
        where: { holding: { workspaceId } },
        select: { id: true, pricePerUnit: true, currency: true, eventDate: true },
      }),
    ]);

    const rateCache = new Map<string, string>();
    const rateFor = async (currency: string, date: Date): Promise<string> => {
      const code = currency.toUpperCase();
      if (code === newBase) return '1';
      const dateOnly = date.toISOString().slice(0, 10);
      const key = `${code}:${dateOnly}`;
      const hit = rateCache.get(key);
      if (hit) return hit;
      const rate = await this.resolveRate(code, newBase, dateOnly);
      rateCache.set(key, rate);
      return rate;
    };

    const txComputed = await Promise.all(
      transactions.map(async (tx: TxRow) => {
        const rate = await rateFor(tx.currencyOriginal, tx.transactionDate);
        const amountBase = new Prisma.Decimal(tx.amountOriginal).mul(rate).toDecimalPlaces(8).toString();
        return { tx, rate, amountBase };
      }),
    );

    const eventComputed = await Promise.all(
      events.map(async (ev) => {
        const rate = await rateFor(ev.currency, ev.eventDate);
        const priceBase = new Prisma.Decimal(ev.pricePerUnit).mul(rate).toDecimalPlaces(8).toString();
        return { id: ev.id, rate, priceBase };
      }),
    );

    const budgets = await this.prisma.budget.findMany({ where: { workspaceId } });

    const limitRate = budgets.length > 0 ? await this.resolveRate(oldBase, newBase) : '1';

    const fxRateTimestamp = new Date();
    const result = await this.prisma.$transaction(async (txc) => {
      for (const { tx, rate, amountBase } of txComputed) {
        await txc.transaction.update({
          where: { id: tx.id },
          data: { amountBase, currencyBase: newBase, fxRateUsed: rate, fxRateTimestamp },
        });
      }

      for (const budget of budgets) {
        let spent = new Prisma.Decimal(0);
        for (const { tx, amountBase } of txComputed) {
          if (
            tx.status === 'CONFIRMED' &&
            tx.type === 'EXPENSE' &&
            tx.categoryId === budget.categoryId &&
            tx.transactionDate >= budget.periodStart &&
            tx.transactionDate <= budget.periodEnd
          ) {
            spent = spent.add(amountBase);
          }
        }
        const amountLimit = new Prisma.Decimal(budget.amountLimit)
          .mul(limitRate)
          .toDecimalPlaces(8)
          .toString();
        await txc.budget.update({
          where: { id: budget.id },
          data: { amountLimit, amountSpent: spent.toString(), currency: newBase },
        });
      }

      for (const { id, rate, priceBase } of eventComputed) {
        await txc.investmentEvent.update({
          where: { id },
          data: { priceBase, fxRateUsed: rate, fxRateTimestamp },
        });
      }

      // Compressed chat summaries reference amounts in the old base currency.
      // Clear them so the assistant doesn't quote stale-currency figures; they
      // rebuild from recent messages on the next summarization pass.
      await txc.conversation.updateMany({
        where: { workspaceId },
        data: { rollingContextSummary: null, summarizedTokenCount: 0, lastSummarizedAt: null },
      });

      const preferredCurrencies = Array.from(
        new Set([...workspace.preferredCurrencies.map((c) => c.toUpperCase()), newBase]),
      );
      const updated = await txc.workspace.update({
        where: { id: workspaceId },
        data: { baseCurrency: newBase, preferredCurrencies },
        select: { baseCurrency: true, preferredCurrencies: true },
      });
      return updated;
    });

    this.logger.log(
      `Recomputed base currency ${oldBase} -> ${newBase} for workspace ${workspaceId} ` +
        `(${txComputed.length} transactions, ${budgets.length} budgets, ${eventComputed.length} events)`,
    );

    return {
      baseCurrency: result.baseCurrency,
      preferredCurrencies: result.preferredCurrencies,
      recomputed: txComputed.length,
    };
  }

  private async resolveRate(from: string, to: string, date?: string): Promise<string> {
    if (from.toUpperCase() === to.toUpperCase()) return '1';
    if (!date) return (await this.fx.getRate(from, to)).rate;
    try {
      return (await this.fx.getRate(from, to, date)).rate;
    } catch {
      return (await this.fx.getRate(from, to)).rate;
    }
  }
}
