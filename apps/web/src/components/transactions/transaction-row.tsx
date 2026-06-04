import { money, shortDate } from '@/lib/format';
import type { Transaction } from '@/lib/types';

function tone(type: string): string {
  if (type === 'INCOME') return 'text-success';
  if (type === 'EXPENSE') return 'text-danger';
  return 'text-muted';
}
function sign(type: string): string {
  if (type === 'INCOME') return '+';
  if (type === 'EXPENSE') return '−';
  return '';
}

export function TransactionRow({ tx, onClick }: { tx: Transaction; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-surface-2/60"
    >
      <div className="min-w-0">
        <p className="truncate text-sm text-ink">{tx.merchant ?? tx.description ?? 'Transaction'}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted">
          <span>{shortDate(tx.transactionDate)}</span>
          {tx.category && (
            <span className="rounded-md border border-line bg-canvas/60 px-1.5 py-0.5 text-faint">
              {tx.category.name}
            </span>
          )}
          {tx.tags.map((t) => (
            <span key={t} className="rounded-md border border-accent/30 bg-accent-soft px-1.5 py-0.5 text-accent">
              {t}
            </span>
          ))}
        </p>
      </div>
      <span className={`shrink-0 font-mono text-sm ${tone(tx.type)}`}>
        {sign(tx.type)}
        {money(tx.amountOriginal, tx.currencyOriginal)}
      </span>
    </button>
  );
}
