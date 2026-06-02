import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { InvestmentEvent, PortfolioHolding } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { FxService } from '../fx/fx.service';
import { MarketDataService } from '../market/market.service';
import type {
  HoldingView,
  InvestmentEventView,
  LogEventParams,
  LogEventResult,
  PortfolioResult,
  PortfolioSummary,
} from './portfolio.types';

const ZERO = new Prisma.Decimal(0);

function dp(value: Prisma.Decimal, places = 8): string {
  return value.toDecimalPlaces(places).toString();
}

function percent(part: Prisma.Decimal, whole: Prisma.Decimal): number {
  if (whole.lessThanOrEqualTo(0)) {
    return 0;
  }
  return Number(part.div(whole).mul(100).toDecimalPlaces(2).toString());
}

@Injectable()
export class PortfolioService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fx: FxService,
    private readonly market: MarketDataService,
  ) {}

  async logEvent(params: LogEventParams): Promise<LogEventResult> {
    const dateOnly = (params.eventDate ?? new Date().toISOString()).slice(0, 10);
    const eventDate = new Date(dateOnly);

    const existing = await this.prisma.portfolioHolding.findUnique({
      where: {
        workspaceId_ownedByUserId_ticker: {
          workspaceId: params.workspaceId,
          ownedByUserId: params.ownedByUserId,
          ticker: params.ticker,
        },
      },
    });

    const holding =
      existing ??
      (await this.prisma.portfolioHolding.create({
        data: {
          workspaceId: params.workspaceId,
          ownedByUserId: params.ownedByUserId,
          ticker: params.ticker,
          name: params.name ?? null,
          exchange: params.exchange ?? null,
          quantity: 0,
          avgCostBasis: 0,
          costCurrency: params.currency,
        },
      }));

    // Freeze the base-currency price for the immutable event ledger.
    const conversion = await this.fx.convertToBase({
      workspaceId: params.workspaceId,
      amount: params.pricePerUnit,
      from: params.currency,
      to: params.baseCurrency,
      date: dateOnly,
    });

    const eventQty = new Prisma.Decimal(params.quantity);
    const priceInCost = new Prisma.Decimal(
      await this.fx.convertAmount(params.pricePerUnit, params.currency, holding.costCurrency, dateOnly),
    );

    const next = this.applyAction(holding, params.action, eventQty, priceInCost);

    const { updatedHolding, event } = await this.prisma.$transaction(async (txc) => {
      const createdEvent = await txc.investmentEvent.create({
        data: {
          holdingId: holding.id,
          action: params.action,
          quantity: params.quantity,
          pricePerUnit: params.pricePerUnit,
          currency: params.currency,
          priceBase: conversion.amountBase,
          fxRateUsed: conversion.fxRateUsed,
          fxRateTimestamp: conversion.fxRateTimestamp,
          eventDate,
          notes: params.notes ?? null,
          sourceMessageId: params.sourceMessageId ?? null,
        },
      });

      const updated = await txc.portfolioHolding.update({
        where: { id: holding.id },
        data: {
          quantity: next.quantity,
          avgCostBasis: next.avgCostBasis,
          isActive: next.isActive,
          ...(params.name ? { name: params.name } : {}),
          ...(params.exchange ? { exchange: params.exchange } : {}),
        },
      });

      return { updatedHolding: updated, event: createdEvent };
    });

    return {
      holding: this.toHoldingView(updatedHolding, null),
      event: this.toEventView(event),
    };
  }

  async getPortfolio(workspaceId: string): Promise<PortfolioResult> {
    const holdings = await this.prisma.portfolioHolding.findMany({
      where: { workspaceId, isActive: true },
      orderBy: { ticker: 'asc' },
    });

    const views = await Promise.all(holdings.map((h) => this.withMarketValue(h)));

    let totalCost = ZERO;
    let totalValue = ZERO;
    for (const v of views) {
      totalCost = totalCost.add(new Prisma.Decimal(v.quantity).mul(v.avgCostBasis));
      if (v.currentValue !== null) {
        totalValue = totalValue.add(new Prisma.Decimal(v.currentValue));
      }
    }
    const totalGainLoss = totalValue.sub(totalCost);

    const summary: PortfolioSummary = {
      totalCostBasis: dp(totalCost, 2),
      totalCurrentValue: dp(totalValue, 2),
      totalGainLoss: dp(totalGainLoss, 2),
      totalGainLossPercent: percent(totalGainLoss, totalCost),
      currency: holdings[0]?.costCurrency ?? 'USD',
    };

    return { holdings: views, summary };
  }

  async listEvents(workspaceId: string, holdingId: string): Promise<InvestmentEventView[]> {
    const holding = await this.prisma.portfolioHolding.findFirst({
      where: { id: holdingId, workspaceId },
    });
    if (!holding) {
      throw new NotFoundException('Holding not found.');
    }
    const events = await this.prisma.investmentEvent.findMany({
      where: { holdingId },
      orderBy: { eventDate: 'desc' },
    });
    return events.map((e) => this.toEventView(e));
  }

  private applyAction(
    holding: PortfolioHolding,
    action: LogEventParams['action'],
    eventQty: Prisma.Decimal,
    priceInCost: Prisma.Decimal,
  ): { quantity: string; avgCostBasis: string; isActive: boolean } {
    const qty = holding.quantity;
    const avg = holding.avgCostBasis;

    if (action === 'BUY' || action === 'ADD') {
      const newQty = qty.add(eventQty);
      const newAvg = newQty.greaterThan(0)
        ? qty.mul(avg).add(eventQty.mul(priceInCost)).div(newQty)
        : avg;
      return { quantity: dp(newQty), avgCostBasis: dp(newAvg), isActive: true };
    }

    if (action === 'SELL') {
      const newQty = Prisma.Decimal.max(qty.sub(eventQty), ZERO);
      return { quantity: dp(newQty), avgCostBasis: dp(avg), isActive: newQty.greaterThan(0) };
    }

    // DIVIDEND / SPLIT: record-only — no quantity/cost change in v1.
    return { quantity: dp(qty), avgCostBasis: dp(avg), isActive: holding.isActive };
  }

  private async withMarketValue(holding: PortfolioHolding): Promise<HoldingView> {
    try {
      const quote = await this.market.getQuote(holding.ticker);
      const price = new Prisma.Decimal(quote.price);
      const currentValue = holding.quantity.mul(price);
      const costValue = holding.quantity.mul(holding.avgCostBasis);
      const gainLoss = currentValue.sub(costValue);
      return this.toHoldingView(holding, {
        currentPrice: quote.price,
        currentValue: dp(currentValue, 2),
        gainLossAmount: dp(gainLoss, 2),
        gainLossPercent: percent(gainLoss, costValue),
        marketDataTimestamp: quote.dataTimestamp,
      });
    } catch {
      return this.toHoldingView(holding, null);
    }
  }

  private toHoldingView(
    holding: PortfolioHolding,
    market: {
      currentPrice: string;
      currentValue: string;
      gainLossAmount: string;
      gainLossPercent: number;
      marketDataTimestamp: string;
    } | null,
  ): HoldingView {
    return {
      id: holding.id,
      ticker: holding.ticker,
      name: holding.name,
      exchange: holding.exchange,
      quantity: holding.quantity.toString(),
      avgCostBasis: holding.avgCostBasis.toString(),
      costCurrency: holding.costCurrency,
      currentPrice: market?.currentPrice ?? null,
      currentValue: market?.currentValue ?? null,
      gainLossAmount: market?.gainLossAmount ?? null,
      gainLossPercent: market?.gainLossPercent ?? null,
      marketDataTimestamp: market?.marketDataTimestamp ?? null,
      isActive: holding.isActive,
    };
  }

  private toEventView(event: InvestmentEvent): InvestmentEventView {
    return {
      id: event.id,
      action: event.action,
      quantity: event.quantity.toString(),
      pricePerUnit: event.pricePerUnit.toString(),
      currency: event.currency,
      priceBase: event.priceBase.toString(),
      eventDate: event.eventDate.toISOString(),
      notes: event.notes,
    };
  }
}
