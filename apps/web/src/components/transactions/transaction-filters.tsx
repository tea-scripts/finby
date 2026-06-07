'use client';

import { CURRENCY_CODES } from '@finby/shared';
import { Dropdown, type DropdownOption } from '@/components/ui/dropdown';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/lib/store';
import type { Category, TransactionQuery } from '@/lib/types';

const TYPE_OPTIONS: DropdownOption[] = [
  { value: '', label: 'All types' },
  { value: 'EXPENSE', label: 'Expense' },
  { value: 'INCOME', label: 'Income' },
  { value: 'TRANSFER', label: 'Transfer' },
];

export function TransactionFilters({
  filters,
  categories,
  onChange,
}: {
  filters: TransactionQuery;
  categories: Category[];
  onChange: (next: TransactionQuery) => void;
}) {
  const preferred = useAuth((s) => s.workspace?.preferredCurrencies);
  const currencyCodes = preferred && preferred.length > 0 ? preferred : CURRENCY_CODES;
  const currencyOptions: DropdownOption[] = [
    { value: '', label: 'All currencies' },
    ...currencyCodes.map((c) => ({ value: c, label: c })),
  ];

  const categoryOptions: DropdownOption[] = [
    { value: '', label: 'All categories' },
    ...categories.filter((c) => !c.isArchived).map((c) => ({ value: c.id, label: c.name })),
  ];

  const set = (patch: Partial<TransactionQuery>) => onChange({ ...filters, ...patch });

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Field label="Type" htmlFor="f-type">
        <Dropdown
          id="f-type"
          aria-label="Filter by type"
          value={filters.type ?? ''}
          onChange={(v) => set({ type: (v || undefined) as TransactionQuery['type'] })}
          options={TYPE_OPTIONS}
        />
      </Field>
      <Field label="Category" htmlFor="f-category">
        <Dropdown
          id="f-category"
          aria-label="Filter by category"
          value={filters.categoryId ?? ''}
          onChange={(v) => set({ categoryId: v || undefined })}
          options={categoryOptions}
        />
      </Field>
      <Field label="Currency" htmlFor="f-currency">
        <Dropdown
          id="f-currency"
          aria-label="Filter by currency"
          value={filters.currency ?? ''}
          onChange={(v) => set({ currency: v || undefined })}
          options={currencyOptions}
        />
      </Field>
      <div className="grid grid-cols-1 gap-2 [&>*]:min-w-0 lg:grid-cols-2">
        <Field label="From" htmlFor="f-from">
          <div className="relative">
            <Input
              id="f-from"
              type="date"
              className="min-w-0 appearance-none"
              value={filters.fromDate ?? ''}
              onChange={(e) => set({ fromDate: e.target.value || undefined })}
            />
            {!filters.fromDate && (
              <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-base text-faint md:text-sm">
                Start date
              </span>
            )}
          </div>
        </Field>
        <Field label="To" htmlFor="f-to">
          <div className="relative">
            <Input
              id="f-to"
              type="date"
              className="min-w-0 appearance-none"
              value={filters.toDate ?? ''}
              onChange={(e) => set({ toDate: e.target.value || undefined })}
            />
            {!filters.toDate && (
              <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-base text-faint md:text-sm">
                End date
              </span>
            )}
          </div>
        </Field>
      </div>
    </div>
  );
}
