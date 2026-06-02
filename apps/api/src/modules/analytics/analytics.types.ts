export interface SummaryResult {
  period: { from: string; to: string };
  totalIncome: string;
  totalExpenses: string;
  netSavings: string;
  savingsRate: number;
  currency: string;
  transactionCount: number;
}

export interface CategoryBreakdownItem {
  category: { id: string; name: string };
  total: string;
  percent: number;
  transactionCount: number;
}

export interface CategoryBreakdownResult {
  breakdown: CategoryBreakdownItem[];
  currency: string;
}

export interface TrendPoint {
  month: string;
  income: string;
  expenses: string;
  savings: string;
}

export interface TrendResult {
  trend: TrendPoint[];
  currency: string;
}

export interface TopMerchantItem {
  merchant: string;
  total: string;
  transactionCount: number;
}

export interface TopMerchantsResult {
  merchants: TopMerchantItem[];
  currency: string;
}
