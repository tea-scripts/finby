// apps/mobile/src/screens/dashboard-screen.tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError, currentMonthRange } from '@finby/core';
import type { AccountView, BudgetView, SummaryResult, Transaction } from '@finby/shared';
import { useAuthStore } from '../lib/use-auth-store';
import { api } from '../lib/runtime.native';
import type { SectionState } from '../components/dashboard/section-card';
import { MonthSummary } from '../components/dashboard/month-summary';
import { BudgetList } from '../components/dashboard/budget-list';
import { AccountCarousel } from '../components/dashboard/account-carousel';
import { RecentTransactions } from '../components/dashboard/recent-transactions';
import { StreakBadge } from '../components/dashboard/streak-badge';

const LOADING = { data: null, loading: true, error: null } as const;

function errMsg(e: unknown): string {
  return e instanceof ApiError ? e.message : 'Could not load this section.';
}

export function DashboardScreen() {
  const workspace = useAuthStore((s) => s.workspace);
  const user = useAuthStore((s) => s.user);

  const [summary, setSummary] = useState<SectionState<SummaryResult>>(LOADING);
  const [budgets, setBudgets] = useState<SectionState<BudgetView[]>>(LOADING);
  const [accounts, setAccounts] = useState<SectionState<AccountView[]>>(LOADING);
  const [recent, setRecent] = useState<SectionState<Transaction[]>>(LOADING);
  const [refreshing, setRefreshing] = useState(false);

  const loadSummary = useCallback(() => {
    if (!workspace) return Promise.resolve();
    const { from, to } = currentMonthRange();
    setSummary(LOADING);
    return api.dashboard
      .getSummary(workspace.id, from, to)
      .then((d) => setSummary({ data: d, loading: false, error: null }))
      .catch((e) => setSummary({ data: null, loading: false, error: errMsg(e) }));
  }, [workspace]);

  const loadBudgets = useCallback(() => {
    if (!workspace) return Promise.resolve();
    setBudgets(LOADING);
    return api.dashboard
      .listBudgets(workspace.id)
      .then((d) => setBudgets({ data: d, loading: false, error: null }))
      .catch((e) => setBudgets({ data: null, loading: false, error: errMsg(e) }));
  }, [workspace]);

  const loadAccounts = useCallback(() => {
    if (!workspace) return Promise.resolve();
    setAccounts(LOADING);
    return api.dashboard
      .listAccounts(workspace.id)
      .then((d) => setAccounts({ data: d, loading: false, error: null }))
      .catch((e) => setAccounts({ data: null, loading: false, error: errMsg(e) }));
  }, [workspace]);

  const loadRecent = useCallback(() => {
    if (!workspace) return Promise.resolve();
    setRecent(LOADING);
    return api.dashboard
      .listRecentTransactions(workspace.id, 10)
      .then((d) => setRecent({ data: d, loading: false, error: null }))
      .catch((e) => setRecent({ data: null, loading: false, error: errMsg(e) }));
  }, [workspace]);

  const initialized = useRef(false);
  useEffect(() => {
    // Fetch once per mount. This screen unmounts on logout/workspace change, so we don't re-fetch on workspace identity changes (avoids a double-fetch on the initial mount under Strict Mode).
    if (!workspace || initialized.current) return;
    initialized.current = true;
    void loadSummary();
    void loadBudgets();
    void loadAccounts();
    void loadRecent();
  }, [workspace, loadSummary, loadBudgets, loadAccounts, loadRecent]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadSummary(), loadBudgets(), loadAccounts(), loadRecent()]);
    setRefreshing(false);
  }, [loadSummary, loadBudgets, loadAccounts, loadRecent]);

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top']}>
      <ScrollView
        contentContainerClassName="gap-5 px-4 py-5"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#8da3c0" />
        }
      >
        <View className="flex-row items-center justify-between">
          <Text className="text-2xl font-bold text-ink">Dashboard</Text>
          <StreakBadge streak={user?.currentStreak ?? 0} />
        </View>
        <MonthSummary state={summary} onRetry={loadSummary} />
        <BudgetList state={budgets} onRetry={loadBudgets} />
        <AccountCarousel state={accounts} onRetry={loadAccounts} />
        <RecentTransactions state={recent} onRetry={loadRecent} />
      </ScrollView>
    </SafeAreaView>
  );
}
