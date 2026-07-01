export type BudgetPeriodP3 = 'MONTHLY' | 'WEEKLY' | 'QUARTERLY' | 'ANNUAL';

export interface BudgetView {
  id: string;
  category: { id: string; name: string; icon: string | null; color: string | null };
  amountLimit: string;
  amountSpent: string;
  currency: string;
  utilizationPercent: number;
  period: string;
  periodStart: string;
  periodEnd: string;
  isActive: boolean;
}

export interface PeriodBounds {
  periodStart: Date;
  periodEnd: Date;
}

/** Returned from applyTransactionSpend so the caller can fire budget alerts. */
export interface BudgetSpendChange {
  budgetId: string;
  categoryName: string;
  amountLimit: string;
  previousSpent: string;
  newSpent: string;
  previousPercent: number;
  newPercent: number;
}
