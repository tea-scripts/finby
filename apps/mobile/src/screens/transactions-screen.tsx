// apps/mobile/src/screens/transactions-screen.tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Pressable, RefreshControl, SectionList, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError } from '@finby/core';
import type { Category, Transaction, TransactionQuery } from '@finby/shared';
import { useAuthStore } from '../lib/use-auth-store';
import { api } from '../lib/runtime.native';
import { groupByDay, presetRange, activeFilterCount } from '../lib/transactions-view';
import { useTabBarSpace } from '../components/nav/floating-tab-bar';
import { SegmentedControl } from '../components/ui/segmented-control';
import { Button } from '../components/ui/button';
import { TransactionRow } from '../components/transactions/transaction-row';
import { TransactionFiltersSheet } from '../components/transactions/transaction-filters-sheet';
import { EditTransactionSheet } from '../components/transactions/edit-transaction-sheet';

type TypeValue = '' | 'EXPENSE' | 'INCOME' | 'TRANSFER';
const TYPE_OPTIONS: { value: TypeValue; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'EXPENSE', label: 'Expense' },
  { value: 'INCOME', label: 'Income' },
  { value: 'TRANSFER', label: 'Transfer' },
];

function errMsg(e: unknown): string {
  return e instanceof ApiError ? e.message : 'Could not load transactions.';
}

export function TransactionsScreen() {
  const workspace = useAuthStore((s) => s.workspace);
  const tabBarSpace = useTabBarSpace();

  const [filters, setFilters] = useState<TransactionQuery>(() => ({ ...presetRange('THIS_MONTH', new Date()), limit: 20 }));
  const [items, setItems] = useState<Transaction[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const loadId = useRef(0);

  useEffect(() => {
    if (!workspace) return;
    api.transactions.listCategories(workspace.id).then(setCategories).catch(() => undefined);
  }, [workspace]);

  const reload = useCallback(async () => {
    if (!workspace) return;
    const id = ++loadId.current;
    setError(null);
    setLoadMoreError(null);
    try {
      const res = await api.transactions.listTransactions(workspace.id, { ...filters, limit: 20 });
      if (loadId.current !== id) return; // a newer reload superseded this one
      setItems(res.transactions);
      setCursor(res.nextCursor);
      setHasMore(res.hasMore);
    } catch (e) {
      if (loadId.current !== id) return;
      setError(errMsg(e));
    }
  }, [workspace, filters]);

  // (Re)load page 1 whenever filters change.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    reload().finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [reload]);

  async function loadMore() {
    if (!workspace || !cursor || loadingMore || !hasMore) return;
    const id = loadId.current;
    setLoadMoreError(null);
    setLoadingMore(true);
    try {
      const res = await api.transactions.listTransactions(workspace.id, { ...filters, cursor, limit: 20 });
      if (loadId.current === id) {
        setItems((prev) => [...prev, ...res.transactions]);
        setCursor(res.nextCursor);
        setHasMore(res.hasMore);
      }
    } catch (e) {
      if (loadId.current === id) setLoadMoreError(errMsg(e));
    } finally {
      setLoadingMore(false);
    }
  }

  async function onRefresh() {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  }

  const sections = groupByDay(items);
  const filterCount = activeFilterCount(filters);

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top']}>
      <View className="flex-row items-center justify-between border-b border-line px-4 py-3">
        <Text className="text-2xl font-bold text-ink">Transactions</Text>
        <Button variant="ghost" onPress={() => setFiltersOpen(true)}>
          {filterCount > 0 ? `Filters · ${filterCount}` : 'Filters'}
        </Button>
      </View>

      <View className="px-4 py-3">
        <SegmentedControl
          options={TYPE_OPTIONS}
          value={(filters.type ?? '') as TypeValue}
          onChange={(v) => setFilters((f) => ({ ...f, type: (v || undefined) as TransactionQuery['type'] }))}
        />
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#1d6ef5" />
        </View>
      ) : error ? (
        <View className="items-center gap-3 px-6 py-10">
          <Text className="text-sm text-danger">{error}</Text>
          <Button variant="ghost" onPress={() => void reload()}>
            Retry
          </Button>
        </View>
      ) : items.length === 0 ? (
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-center text-sm text-muted">No transactions match these filters.</Text>
        </View>
      ) : (
        <SectionList
          testID="tx-list"
          sections={sections}
          keyExtractor={(t) => t.id}
          stickySectionHeadersEnabled
          contentContainerStyle={{ paddingBottom: tabBarSpace, paddingHorizontal: 16 }}
          onEndReachedThreshold={0.4}
          onEndReached={() => void loadMore()}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#8da3c0" />}
          renderSectionHeader={({ section }) => (
            <Text className="bg-canvas py-2 text-xs font-semibold uppercase tracking-wide text-muted">
              {section.title}
            </Text>
          )}
          renderItem={({ item, index }) => <AnimatedRow index={index} tx={item} onPress={() => setEditing(item)} />}
          ListFooterComponent={
            loadingMore ? (
              <View className="py-4">
                <ActivityIndicator color="#8da3c0" />
              </View>
            ) : loadMoreError ? (
              <Pressable testID="load-more-retry" onPress={() => void loadMore()} className="items-center py-4">
                <Text className="text-sm text-danger">Couldn't load more. Tap to retry.</Text>
              </Pressable>
            ) : null
          }
        />
      )}

      <TransactionFiltersSheet
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        filters={filters}
        categories={categories}
        preferredCurrencies={workspace?.preferredCurrencies ?? []}
        onApply={setFilters}
      />

      {editing && workspace ? (
        <EditTransactionSheet
          open
          workspaceId={workspace.id}
          transaction={editing}
          categories={categories}
          onSaved={(u) => {
            setItems((prev) => prev.map((t) => (t.id === u.id ? u : t)));
            setEditing(null);
          }}
          onVoided={(id) => {
            setItems((prev) => prev.filter((t) => t.id !== id));
            setEditing(null);
          }}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </SafeAreaView>
  );
}

/** A row that fades + rises in on mount, staggered by its position on the page. */
function AnimatedRow({ index, tx, onPress }: { index: number; tx: Transaction; onPress: () => void }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: 220,
      delay: Math.min(index, 8) * 28,
      useNativeDriver: true,
    }).start();
  }, [anim, index]);
  return (
    <Animated.View
      style={{
        opacity: anim,
        transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
      }}
    >
      <TransactionRow tx={tx} onPress={onPress} />
    </Animated.View>
  );
}
