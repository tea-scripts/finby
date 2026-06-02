export type AlertStatusP3 = 'UNREAD' | 'READ' | 'DISMISSED';
export type BudgetAlertType = 'BUDGET_75_PERCENT' | 'BUDGET_90_PERCENT' | 'BUDGET_EXCEEDED';

export interface AlertView {
  id: string;
  type: string;
  status: string;
  title: string;
  body: string;
  createdAt: string;
}

export interface AlertListResult {
  alerts: AlertView[];
  unreadCount: number;
  nextCursor: string | null;
  hasMore: boolean;
}
