export type {
  SummaryResult,
  CategoryBreakdownItem,
  CategoryBreakdownResult,
  TrendPoint,
  TrendResult,
} from '@finby/shared';

export interface TopMerchantItem {
  merchant: string;
  total: string;
  transactionCount: number;
}

export interface TopMerchantsResult {
  merchants: TopMerchantItem[];
  currency: string;
}

export interface NetWorthResult {
  cashTotal: string;
  portfolioTotal: string;
  netWorth: string;
  currency: string;
  snapshot: string;
}
