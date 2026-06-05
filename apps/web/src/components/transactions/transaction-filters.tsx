'use client';

import { Dropdown, type DropdownOption } from '@/components/ui/dropdown';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import type { Category, TransactionQuery } from '@/lib/types';

const TYPE_OPTIONS: DropdownOption[] = [
  { value: '', label: 'All types' },
  { value: 'EXPENSE', label: 'Expense' },
  { value: 'INCOME', label: 'Income' },
  { value: 'TRANSFER', label: 'Transfer' },
];

const CURRENCIES = ['USD', 'EUR', 'GBP', 'NGN', 'KES', 'GHS', 'ZAR', 'CAD', 'AUD', 'INR', 'JPY'];
const CURRENCY_OPTIONS: DropdownOption[] = [
  { value: '', label: 'All currencies' },
  ...CURRENCIES.map((c) => ({ value: c, label: c })),
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
          options={CURRENCY_OPTIONS}
        />
      </Field>
      <div className="grid grid-cols-2 gap-2 [&>*]:min-w-0">
        <Field label="From" htmlFor="f-from">
          <Input
            id="f-from"
            type="date"
            className="min-w-0"
            value={filters.fromDate ?? ''}
            onChange={(e) => set({ fromDate: e.target.value || undefined })}
          />
        </Field>
        <Field label="To" htmlFor="f-to">
          <Input
            id="f-to"
            type="date"
            className="min-w-0"
            value={filters.toDate ?? ''}
            onChange={(e) => set({ toDate: e.target.value || undefined })}
          />
        </Field>
      </div>
    </div>
  );
}
