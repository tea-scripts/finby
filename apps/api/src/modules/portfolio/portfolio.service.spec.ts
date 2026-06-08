import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { FxService } from '../fx/fx.service';
import { MarketDataService } from '../market/market.service';
import { PortfolioService } from './portfolio.service';

function buildPrisma() {
  const holding = { findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), findMany: jest.fn(), findFirst: jest.fn(), count: jest.fn().mockResolvedValue(0) };
  const investmentEvent = { create: jest.fn(), findMany: jest.fn() };
  const client = { portfolioHolding: holding, investmentEvent, $transaction: jest.fn() };
  client.$transaction.mockImplementation((arg: unknown) =>
    typeof arg === 'function' ? (arg as (c: typeof client) => unknown)(client) : Promise.all(arg as unknown[]),
  );
  return client;
}

function buildFx() {
  return {
    convertToBase: jest.fn().mockResolvedValue({
      amountBase: '189',
      fxRateUsed: '1',
      fxRateTimestamp: new Date('2026-06-02T00:00:00.000Z'),
      rate: '1',
      date: '2026-06-02',
    }),
    convertAmount: jest.fn().mockImplementation((amount: string) => Promise.resolve(amount)),
  };
}

function buildMarket(price?: string) {
  return {
    getQuote: jest.fn().mockResolvedValue({
      ticker: 'AAPL',
      price: price ?? '191.20',
      currency: 'USD',
      change: '1.40',
      changePercent: 0.74,
      volume: 1,
      marketCap: null,
      dataTimestamp: '2026-06-02T20:00:00.000Z',
      isDelayed: true,
    }),
  };
}

const baseParams = {
  workspaceId: 'w1',
  ownedByUserId: 'u1',
  baseCurrency: 'USD',
  tier: 'PRO' as const,
  ticker: 'AAPL',
  currency: 'USD',
  eventDate: '2026-05-28',
};

function holdingRow(extra: Record<string, unknown> = {}) {
  return {
    id: 'h1',
    ticker: 'AAPL',
    name: 'Apple Inc.',
    exchange: 'NASDAQ',
    quantity: new Prisma.Decimal('0'),
    avgCostBasis: new Prisma.Decimal('0'),
    costCurrency: 'USD',
    isActive: true,
    ...extra,
  };
}

describe('PortfolioService.logEvent — cost basis', () => {
  it('BUY into an empty holding sets quantity and avgCostBasis', async () => {
    const prisma = buildPrisma();
    prisma.portfolioHolding.findUnique.mockResolvedValue(null);
    prisma.portfolioHolding.create.mockResolvedValue(holdingRow());
    prisma.portfolioHolding.update.mockResolvedValue(
      holdingRow({ quantity: new Prisma.Decimal('5'), avgCostBasis: new Prisma.Decimal('189') }),
    );
    prisma.investmentEvent.create.mockResolvedValue({
      id: 'e1', action: 'BUY', quantity: new Prisma.Decimal('5'), pricePerUnit: new Prisma.Decimal('189'),
      currency: 'USD', priceBase: new Prisma.Decimal('189'), eventDate: new Date('2026-05-28'), notes: null,
    });
    const service = new PortfolioService(prisma as unknown as PrismaService, buildFx() as unknown as FxService, buildMarket() as unknown as MarketDataService);

    const result = await service.logEvent({ ...baseParams, action: 'BUY', quantity: '5', pricePerUnit: '189' });

    const updateArg = prisma.portfolioHolding.update.mock.calls[0]?.[0] as { data: { quantity: string; avgCostBasis: string } };
    expect(updateArg.data.quantity).toBe('5');
    expect(updateArg.data.avgCostBasis).toBe('189');
    expect(result.holding.quantity).toBe('5');
  });

  it('BUY into an existing position computes the weighted-average cost', async () => {
    const prisma = buildPrisma();
    prisma.portfolioHolding.findUnique.mockResolvedValue(
      holdingRow({ quantity: new Prisma.Decimal('10'), avgCostBasis: new Prisma.Decimal('178.50') }),
    );
    prisma.portfolioHolding.update.mockResolvedValue(holdingRow({ quantity: new Prisma.Decimal('15') }));
    prisma.investmentEvent.create.mockResolvedValue({
      id: 'e2', action: 'BUY', quantity: new Prisma.Decimal('5'), pricePerUnit: new Prisma.Decimal('189'),
      currency: 'USD', priceBase: new Prisma.Decimal('189'), eventDate: new Date('2026-05-28'), notes: null,
    });
    const service = new PortfolioService(prisma as unknown as PrismaService, buildFx() as unknown as FxService, buildMarket() as unknown as MarketDataService);

    await service.logEvent({ ...baseParams, action: 'BUY', quantity: '5', pricePerUnit: '189' });

    // (10*178.50 + 5*189) / 15 = (1785 + 945) / 15 = 2730/15 = 182
    const updateArg = prisma.portfolioHolding.update.mock.calls[0]?.[0] as { data: { quantity: string; avgCostBasis: string } };
    expect(updateArg.data.quantity).toBe('15');
    expect(updateArg.data.avgCostBasis).toBe('182');
  });

  it('SELL reduces quantity, keeps avgCostBasis, and deactivates at zero', async () => {
    const prisma = buildPrisma();
    prisma.portfolioHolding.findUnique.mockResolvedValue(
      holdingRow({ quantity: new Prisma.Decimal('5'), avgCostBasis: new Prisma.Decimal('182') }),
    );
    prisma.portfolioHolding.update.mockResolvedValue(holdingRow({ quantity: new Prisma.Decimal('0'), isActive: false }));
    prisma.investmentEvent.create.mockResolvedValue({
      id: 'e3', action: 'SELL', quantity: new Prisma.Decimal('5'), pricePerUnit: new Prisma.Decimal('200'),
      currency: 'USD', priceBase: new Prisma.Decimal('200'), eventDate: new Date('2026-05-28'), notes: null,
    });
    const service = new PortfolioService(prisma as unknown as PrismaService, buildFx() as unknown as FxService, buildMarket() as unknown as MarketDataService);

    await service.logEvent({ ...baseParams, action: 'SELL', quantity: '5', pricePerUnit: '200' });

    const updateArg = prisma.portfolioHolding.update.mock.calls[0]?.[0] as { data: { quantity: string; avgCostBasis: string; isActive: boolean } };
    expect(updateArg.data.quantity).toBe('0');
    expect(updateArg.data.avgCostBasis).toBe('182'); // unchanged
    expect(updateArg.data.isActive).toBe(false);
  });

  it('blocks a new holding when the tier holdings cap is reached', async () => {
    const prisma = buildPrisma();
    prisma.portfolioHolding.findUnique.mockResolvedValue(null);
    prisma.portfolioHolding.count.mockResolvedValue(10); // PRO cap = 10
    const service = new PortfolioService(
      prisma as unknown as PrismaService,
      buildFx() as unknown as FxService,
      buildMarket() as unknown as MarketDataService,
    );
    await expect(
      service.logEvent({ ...baseParams, ticker: 'NEWCO', action: 'BUY', quantity: '1', pricePerUnit: '10' }),
    ).rejects.toMatchObject({ response: { error: 'TIER_LIMIT' } });
    expect(prisma.portfolioHolding.create).not.toHaveBeenCalled();
  });

  it('creates the holding with costCurrency from the first event', async () => {
    const prisma = buildPrisma();
    prisma.portfolioHolding.findUnique.mockResolvedValue(null);
    prisma.portfolioHolding.create.mockResolvedValue(holdingRow());
    prisma.portfolioHolding.update.mockResolvedValue(holdingRow({ quantity: new Prisma.Decimal('5') }));
    prisma.investmentEvent.create.mockResolvedValue({
      id: 'e1', action: 'BUY', quantity: new Prisma.Decimal('5'), pricePerUnit: new Prisma.Decimal('189'),
      currency: 'USD', priceBase: new Prisma.Decimal('189'), eventDate: new Date('2026-05-28'), notes: null,
    });
    const service = new PortfolioService(prisma as unknown as PrismaService, buildFx() as unknown as FxService, buildMarket() as unknown as MarketDataService);

    await service.logEvent({ ...baseParams, action: 'BUY', quantity: '5', pricePerUnit: '189' });

    const createArg = prisma.portfolioHolding.create.mock.calls[0]?.[0] as { data: { costCurrency: string } };
    expect(createArg.data.costCurrency).toBe('USD');
  });
});

describe('PortfolioService.renameTicker', () => {
  it('renames the holding when the target ticker is free', async () => {
    const prisma = buildPrisma();
    prisma.portfolioHolding.findUnique
      .mockResolvedValueOnce(holdingRow({ ticker: 'APPL' })) // source
      .mockResolvedValueOnce(null); // no conflict
    prisma.portfolioHolding.update.mockResolvedValue(holdingRow({ ticker: 'AAPL' }));
    const service = new PortfolioService(prisma as unknown as PrismaService, buildFx() as unknown as FxService, buildMarket() as unknown as MarketDataService);

    const view = await service.renameTicker({ workspaceId: 'w1', ownedByUserId: 'u1', fromTicker: 'appl', toTicker: 'aapl' });

    expect(prisma.portfolioHolding.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'h1' }, data: { ticker: 'AAPL' } }),
    );
    expect(view.ticker).toBe('AAPL');
  });

  it('throws NotFound when the source ticker has no holding', async () => {
    const prisma = buildPrisma();
    prisma.portfolioHolding.findUnique.mockResolvedValueOnce(null);
    const service = new PortfolioService(prisma as unknown as PrismaService, buildFx() as unknown as FxService, buildMarket() as unknown as MarketDataService);

    await expect(
      service.renameTicker({ workspaceId: 'w1', ownedByUserId: 'u1', fromTicker: 'APPL', toTicker: 'AAPL' }),
    ).rejects.toMatchObject({ message: expect.stringContaining('APPL') });
    expect(prisma.portfolioHolding.update).not.toHaveBeenCalled();
  });

  it('refuses to merge into an existing holding', async () => {
    const prisma = buildPrisma();
    prisma.portfolioHolding.findUnique
      .mockResolvedValueOnce(holdingRow({ ticker: 'APPL' }))
      .mockResolvedValueOnce(holdingRow({ id: 'h2', ticker: 'AAPL' }));
    const service = new PortfolioService(prisma as unknown as PrismaService, buildFx() as unknown as FxService, buildMarket() as unknown as MarketDataService);

    await expect(
      service.renameTicker({ workspaceId: 'w1', ownedByUserId: 'u1', fromTicker: 'APPL', toTicker: 'AAPL' }),
    ).rejects.toMatchObject({ message: expect.stringContaining('AAPL') });
    expect(prisma.portfolioHolding.update).not.toHaveBeenCalled();
  });
});

describe('PortfolioService.getPortfolio', () => {
  it('computes current value and gain/loss from a live quote', async () => {
    const prisma = buildPrisma();
    prisma.portfolioHolding.findMany.mockResolvedValue([
      holdingRow({ quantity: new Prisma.Decimal('10'), avgCostBasis: new Prisma.Decimal('178.50') }),
    ]);
    const service = new PortfolioService(
      prisma as unknown as PrismaService,
      buildFx() as unknown as FxService,
      buildMarket('191.20') as unknown as MarketDataService,
    );

    const result = await service.getPortfolio('w1');

    const h = result.holdings[0];
    expect(h?.currentPrice).toBe('191.20');
    expect(h?.currentValue).toBe('1912'); // 10 * 191.20
    expect(h?.gainLossAmount).toBe('127'); // 1912 - 1785
    expect(h?.gainLossPercent).toBeCloseTo(7.11, 1);
    expect(result.summary.totalCurrentValue).toBe('1912');
  });

  it('degrades gracefully when the market quote is unavailable', async () => {
    const prisma = buildPrisma();
    prisma.portfolioHolding.findMany.mockResolvedValue([
      holdingRow({ quantity: new Prisma.Decimal('10'), avgCostBasis: new Prisma.Decimal('178.50') }),
    ]);
    const market = { getQuote: jest.fn().mockRejectedValue(new Error('rate limited')) };
    const service = new PortfolioService(
      prisma as unknown as PrismaService,
      buildFx() as unknown as FxService,
      market as unknown as MarketDataService,
    );

    const result = await service.getPortfolio('w1');
    expect(result.holdings[0]?.currentPrice).toBeNull();
    expect(result.holdings[0]?.currentValue).toBeNull();
  });
});
