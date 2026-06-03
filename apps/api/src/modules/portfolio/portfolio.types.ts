import type { SubscriptionTier } from '@finby/shared';

export type InvestmentActionP4 = 'BUY' | 'SELL' | 'DIVIDEND' | 'SPLIT' | 'ADD';

export interface LogEventParams {
  workspaceId: string;
  ownedByUserId: string;
  baseCurrency: string;
  tier: SubscriptionTier;
  ticker: string;
  action: InvestmentActionP4;
  quantity: string;
  pricePerUnit: string;
  currency: string;
  eventDate: string;
  notes?: string | null;
  name?: string | null;
  exchange?: string | null;
  sourceMessageId?: string | null;
}

export interface InvestmentEventView {
  id: string;
  action: string;
  quantity: string;
  pricePerUnit: string;
  currency: string;
  priceBase: string;
  eventDate: string;
  notes: string | null;
}

export interface HoldingView {
  id: string;
  ticker: string;
  name: string | null;
  exchange: string | null;
  quantity: string;
  avgCostBasis: string;
  costCurrency: string;
  currentPrice: string | null;
  currentValue: string | null;
  gainLossAmount: string | null;
  gainLossPercent: number | null;
  marketDataTimestamp: string | null;
  isActive: boolean;
}

export interface PortfolioSummary {
  totalCostBasis: string;
  totalCurrentValue: string;
  totalGainLoss: string;
  totalGainLossPercent: number;
  currency: string;
}

export interface PortfolioResult {
  holdings: HoldingView[];
  summary: PortfolioSummary;
}

export interface LogEventResult {
  holding: HoldingView;
  event: InvestmentEventView;
}
