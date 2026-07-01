// apps/mobile/src/screens/dashboard-screen.tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshControl, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError, currentMonth, monthToRange, type MonthRef } from '@finby/core';
import type {
  AccountView,
  BudgetView,
  CategoryBreakdownResult,
  InsightResult,
  SummaryResult,
  TrendResult,
} from '@finby/shared';
import { useAuthStore } from '../lib/use-auth-store';
import { api } from '../lib/runtime.native';
import type { SectionState } from '../components/dashboard/section-card';
import { MonthSelector } from '../components/dashboard/month-selector';
import { MonthSummary } from '../components/dashboard/month-summary';
import { AccountCarousel } from '../components/dashboard/account-carousel';
import { SpendingDonut } from '../components/dashboard/spending-donut';
import { BudgetList } from '../components/dashboard/budget-list';
import { SpendTrend } from '../components/dashboard/spend-trend';
import { InsightCard } from '../components/dashboard/insight-card';
import { useTabBarSpace } from '../components/nav/floating-tab-bar';

const LOADING = { data: null, loading: true, error: null } as const;

function errMsg(e: unknown): string {
  return e instanceof ApiError ? e.message : 'Could not load this section.';
}

export function DashboardScreen() {
  const workspace = useAuthStore((s) => s.workspace);
  const tier = workspace?.tier ?? 'FREE';

  const [month, setMonth] = useState<MonthRef>(() => currentMonth());
  const [summary, setSummary] = useState<SectionState<SummaryResult>>(LOADING);
  const [donut, setDonut] = useState<SectionState<CategoryBreakdownResult>>(LOADING);
  const [insight, setInsight] = useState<SectionState<InsightResult>>(LOADING);
  const [budgets, setBudgets] = useState<SectionState<BudgetView[]>>(LOADING);
  const [accounts, setAccounts] = useState<SectionState<AccountView[]>>(LOADING);
  const [trend, setTrend] = useState<SectionState<TrendResult>>(LOADING);
  const [refreshing, setRefreshing] = useState(false);
  const tabBarSpace = useTabBarSpace();

  const loadSummary = useCallback(
    (m: MonthRef) => {
      if (!workspace) return Promise.resolve();
      const { from, to } = monthToRange(m);
      setSummary(LOADING);
      return api.dashboard
        .getSummary(workspace.id, from, to)
        .then((d) => setSummary({ data: d, loading: false, error: null }))
        .catch((e) => setSummary({ data: null, loading: false, error: errMsg(e) }));
    },
    [workspace],
  );

  const loadDonut = useCallback(
    (m: MonthRef) => {
      if (!workspace) return Promise.resolve();
      const { from, to } = monthToRange(m);
      setDonut(LOADING);
      return api.dashboard
        .getByCategory(workspace.id, from, to, 'EXPENSE')
        .then((d) => setDonut({ data: d, loading: false, error: null }))
        .catch((e) => setDonut({ data: null, loading: false, error: errMsg(e) }));
    },
    [workspace],
  );

  const loadInsight = useCallback(
    (m: MonthRef) => {
      if (!workspace) return Promise.resolve();
      const { from, to } = monthToRange(m);
      setInsight(LOADING);
      return api.dashboard
        .getInsight(workspace.id, from, to)
        .then((d) => setInsight({ data: d, loading: false, error: null }))
        .catch((e) => setInsight({ data: null, loading: false, error: errMsg(e) }));
    },
    [workspace],
  );

  const loadBudgets = useCallback(
    (m: MonthRef) => {
      if (!workspace) return Promise.resolve();
      const { from } = monthToRange(m);
      setBudgets(LOADING);
      return api.dashboard
        .listBudgets(workspace.id, from)
        .then((d) => setBudgets({ data: d, loading: false, error: null }))
        .catch((e) => setBudgets({ data: null, loading: false, error: errMsg(e) }));
    },
    [workspace],
  );

  const loadAccounts = useCallback(() => {
    if (!workspace) return Promise.resolve();
    setAccounts(LOADING);
    return api.dashboard
      .listAccounts(workspace.id)
      .then((d) => setAccounts({ data: d, loading: false, error: null }))
      .catch((e) => setAccounts({ data: null, loading: false, error: errMsg(e) }));
  }, [workspace]);

  const loadTrend = useCallback(() => {
    if (!workspace) return Promise.resolve();
    setTrend(LOADING);
    return api.dashboard
      .getTrend(workspace.id)
      .then((d) => setTrend({ data: d, loading: false, error: null }))
      .catch((e) => setTrend({ data: null, loading: false, error: errMsg(e) }));
  }, [workspace]);

  const loadMonth = useCallback(
    (m: MonthRef) => Promise.all([loadSummary(m), loadDonut(m), loadInsight(m), loadBudgets(m)]),
    [loadSummary, loadDonut, loadInsight, loadBudgets],
  );

  const loadStatic = useCallback(
    () => Promise.all([loadAccounts(), loadTrend()]),
    [loadAccounts, loadTrend],
  );

  const initialized = useRef(false);
  useEffect(() => {
    if (!workspace || initialized.current) return;
    initialized.current = true;
    void loadMonth(month);
    void loadStatic();
  }, [workspace, month, loadMonth, loadStatic]);

  const onSelectMonth = useCallback(
    (m: MonthRef) => {
      setMonth(m);
      void loadMonth(m);
    },
    [loadMonth],
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadMonth(month), loadStatic()]);
    setRefreshing(false);
  }, [loadMonth, loadStatic, month]);

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top']}>
      <ScrollView
        contentContainerClassName="gap-5 px-4 py-5"
        contentContainerStyle={{ paddingBottom: tabBarSpace }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#8da3c0" />}
      >
        <MonthSelector month={month} onChange={onSelectMonth} tier={tier} />
        <MonthSummary state={summary} onRetry={() => loadSummary(month)} />
        <AccountCarousel state={accounts} onRetry={loadAccounts} />
        <SpendingDonut state={donut} onRetry={() => loadDonut(month)} />
        <BudgetList state={budgets} onRetry={() => loadBudgets(month)} />
        <SpendTrend state={trend} onRetry={loadTrend} />
        <InsightCard state={insight} onRetry={() => loadInsight(month)} />
      </ScrollView>
    </SafeAreaView>
  );
}
