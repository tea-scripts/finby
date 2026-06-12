'use client';

import { useEffect, useRef, useState } from 'react';
import { ReceiptScanner } from '@/components/receipts/ReceiptScanner';
import { EditTransactionModal } from '@/components/transactions/edit-transaction-modal';
import { TransactionFilters } from '@/components/transactions/transaction-filters';
import { TransactionRow } from '@/components/transactions/transaction-row';
import { Button } from '@/components/ui/button';
import { Lottie } from '@/components/ui/lottie';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError } from '@/lib/api-client';
import { currentMonthRange } from '@/lib/format';
import { listCategories, listTransactions } from '@/lib/transactions-api';
import { useAuth } from '@/lib/store';
import type { Category, Transaction, TransactionQuery } from '@/lib/types';

function errMsg(e: unknown): string {
  return e instanceof ApiError ? e.message : 'Could not load transactions.';
}

export default function TransactionsPage() {
  const workspace = useAuth((s) => s.workspace);

  // Default the date range to the current month (1st → today). The user can
  // widen or clear it from the filters.
  const [filters, setFilters] = useState<TransactionQuery>(() => {
    const { from, to } = currentMonthRange();
    return { fromDate: from, toDate: to };
  });
  const [items, setItems] = useState<Transaction[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    },
    [],
  );

  // A confirmed receipt scan logged a new transaction: reload page 1 (a fresh
  // filters object retriggers the load effect) and surface a brief toast.
  function handleReceiptLogged() {
    setFilters((f) => ({ ...f }));
    setToast('Receipt logged — transaction added.');
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3000);
  }

  // Categories for the filter + edit pickers (load once).
  useEffect(() => {
    if (!workspace) return;
    listCategories(workspace.id)
      .then(setCategories)
      .catch(() => undefined);
  }, [workspace]);

  // (Re)load page 1 whenever filters change.
  useEffect(() => {
    if (!workspace) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    listTransactions(workspace.id, { ...filters, limit: 20 })
      .then((res) => {
        if (cancelled) return;
        setItems(res.transactions);
        setCursor(res.nextCursor);
        setHasMore(res.hasMore);
      })
      .catch((e) => {
        if (!cancelled) setError(errMsg(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [workspace, filters]);

  async function loadMore() {
    if (!workspace || !cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await listTransactions(workspace.id, { ...filters, cursor, limit: 20 });
      setItems((prev) => [...prev, ...res.transactions]);
      setCursor(res.nextCursor);
      setHasMore(res.hasMore);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="h-full overflow-y-auto pb-nav">
      <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-6 animate-fade-up">
        <div className="flex items-center justify-between gap-3">
          <h1 className="font-display text-2xl font-bold text-ink">Transactions</h1>
          <Button variant="ghost" onClick={() => setScannerOpen(true)}>
            Scan Receipt
          </Button>
        </div>

        <TransactionFilters filters={filters} categories={categories} onChange={setFilters} />

        <div className="overflow-hidden rounded-2xl border border-line bg-surface/60 shadow-card">
          {loading ? (
            <div className="space-y-px p-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : error ? (
            <p className="p-5 text-sm text-danger">{error}</p>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-10 text-center">
              <Lottie src="/lottie/empty.json" className="h-20 w-20" />
              <p className="text-sm text-faint">No transactions match these filters.</p>
            </div>
          ) : (
            <div className="divide-y divide-line">
              {items.map((tx) => (
                <TransactionRow key={tx.id} tx={tx} onClick={() => setEditing(tx)} />
              ))}
            </div>
          )}
        </div>

        {hasMore && !loading && (
          <div className="flex justify-center">
            <Button variant="ghost" loading={loadingMore} onClick={loadMore}>
              Load more
            </Button>
          </div>
        )}
      </div>

      {toast && (
        <div
          role="status"
          className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-full border border-line bg-surface px-4 py-2 text-sm text-ink shadow-card"
        >
          {toast}
        </div>
      )}

      <ReceiptScanner
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onLogged={handleReceiptLogged}
      />

      {editing && workspace && (
        <EditTransactionModal
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
      )}
    </div>
  );
}
