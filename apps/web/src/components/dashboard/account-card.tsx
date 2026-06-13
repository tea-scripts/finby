'use client';

import { ACCOUNT_TYPE_LABELS, type AccountType } from '@finby/shared';
import { useFormatters } from '@/lib/use-formatters';
import type { AccountView } from '@/lib/types';
import { CurrencyFlag } from '@/components/ui/currency-flag';

const ACCENT = '#1d6ef5';

/** A valid #RRGGBB tint, or the app accent when missing/invalid. */
function tintColor(color: string | null): string {
  return color && /^#[0-9a-fA-F]{6}$/.test(color) ? color : ACCENT;
}

/** A single account's balance card — one slide in the dashboard carousel. */
export function AccountCard({ account }: { account: AccountView }) {
  const { formatMoney } = useFormatters();
  const tint = tintColor(account.color);
  // Cast for the keyed lookup; the ?? fallback handles values the server may send
  // that aren't in ACCOUNT_TYPE_LABELS.
  const typeLabel = ACCOUNT_TYPE_LABELS[account.accountType as AccountType] ?? account.accountType;

  return (
    <div
      data-tint={tint}
      className="relative min-h-[120px] overflow-hidden rounded-2xl border p-5"
      style={{
        // `33` ≈ 20% fill, `73` ≈ 45% border (8-digit hex alpha).
        background: `linear-gradient(135deg, ${tint}33 0%, rgb(11 22 38 / 0.95) 55%)`,
        borderColor: `${tint}73`,
      }}
    >
      <div className="absolute right-5 top-5 flex items-center gap-2 text-sm font-semibold text-ink">
        <CurrencyFlag currency={account.currency} size={26} />
        {account.currency}
      </div>
      <p className="text-xs font-medium text-muted">Balance</p>
      <p className="mt-1 text-3xl font-bold tracking-tight text-ink">
        {formatMoney(account.balance, account.currency)}
      </p>
      <p className="mt-1.5 truncate text-xs text-faint">
        {account.name} · {typeLabel}
      </p>
    </div>
  );
}
