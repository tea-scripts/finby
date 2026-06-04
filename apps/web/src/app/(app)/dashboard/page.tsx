'use client';

import { useEffect, useRef, useState } from 'react';
import { AccountList } from '@/components/dashboard/account-list';
import { BudgetList } from '@/components/dashboard/budget-list';
import { MonthSummary } from '@/components/dashboard/month-summary';
import { RecentTransactions } from '@/components/dashboard/recent-transactions';
import { ApiError } from '@/lib/api-client';
import {
  getSummary,
  listAccounts,
  listBudgets,
  listRecentTransactions,
  type SectionState,
} from '@/lib/dashboard-api';
import { currentMonthRange } from '@/lib/format';
import { useAuth } from '@/lib/store';
import type { AccountView, BudgetView, SummaryResult, Transaction } from '@/lib/types';

const LOADING = { data: null, loading: true, error: null } as const;

function errMsg(e: unknown): string {
  return e instanceof ApiError ? e.message : 'Could not load this section.';
}

export default function DashboardPage() {
  const workspace = useAuth((s) => s.workspace);

  const [summary, setSummary] = useState<SectionState<SummaryResult>>(LOADING);
  const [budgets, setBudgets] = useState<SectionState<BudgetView[]>>(LOADING);
  const [recent, setRecent] = useState<SectionState<Transaction[]>>(LOADING);
  const [accounts, setAccounts] = useState<SectionState<AccountView[]>>(LOADING);

  const initialized = useRef(false);

  useEffect(() => {
    if (!workspace || initialized.current) return;
    initialized.current = true;
    const wsId = workspace.id;
    const { from, to } = currentMonthRange();

    // Independent parallel fetches — each section renders as its data arrives.
    getSummary(wsId, from, to)
      .then((d) => setSummary({ data: d, loading: false, error: null }))
      .catch((e) => setSummary({ data: null, loading: false, error: errMsg(e) }));
    listBudgets(wsId)
      .then((d) => setBudgets({ data: d, loading: false, error: null }))
      .catch((e) => setBudgets({ data: null, loading: false, error: errMsg(e) }));
    listRecentTransactions(wsId, 10)
      .then((d) => setRecent({ data: d, loading: false, error: null }))
      .catch((e) => setRecent({ data: null, loading: false, error: errMsg(e) }));
    listAccounts(wsId)
      .then((d) => setAccounts({ data: d, loading: false, error: null }))
      .catch((e) => setAccounts({ data: null, loading: false, error: errMsg(e) }));
  }, [workspace]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-6 animate-fade-up">
        <h1 className="font-display text-2xl font-bold text-ink">Dashboard</h1>
        <MonthSummary state={summary} />
        <div className="grid gap-5 lg:grid-cols-2">
          <BudgetList state={budgets} />
          <AccountList state={accounts} />
        </div>
        <RecentTransactions state={recent} />
      </div>
    </div>
  );
}
