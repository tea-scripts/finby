import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { CURRENCY_CODES, type Category, type TransactionQuery } from '@finby/shared';
import { Button } from '../ui/button';
import { Dropdown } from '../ui/dropdown';
import { Field } from '../ui/field';
import { DatePicker } from '../ui/date-picker';
import { BottomSheet } from '../ui/bottom-sheet';
import { DATE_PRESET_OPTIONS, presetRange, type DatePreset } from '../../lib/transactions-view';

function presetOf(f: TransactionQuery): DatePreset {
  if (!f.fromDate && !f.toDate) return 'ALL';
  const now = new Date();
  for (const p of ['THIS_MONTH', 'LAST_MONTH', 'LAST_90'] as const) {
    const r = presetRange(p, now);
    if (r.fromDate === f.fromDate && r.toDate === f.toDate) return p;
  }
  return 'CUSTOM';
}

export function TransactionFiltersSheet({
  open,
  onClose,
  filters,
  categories,
  preferredCurrencies,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  filters: TransactionQuery;
  categories: Category[];
  preferredCurrencies: string[];
  onApply: (next: TransactionQuery) => void;
}) {
  const [categoryId, setCategoryId] = useState(filters.categoryId ?? '');
  const [currency, setCurrency] = useState(filters.currency ?? '');
  const [preset, setPreset] = useState<DatePreset>(presetOf(filters));
  const [fromDate, setFromDate] = useState(filters.fromDate ?? '');
  const [toDate, setToDate] = useState(filters.toDate ?? '');

  // Re-seed the draft from the active filters only when the sheet opens (keyed on
  // `open`); re-seeding on every `filters` change would clobber in-progress edits.
  useEffect(() => {
    if (!open) return;
    setCategoryId(filters.categoryId ?? '');
    setCurrency(filters.currency ?? '');
    setPreset(presetOf(filters));
    setFromDate(filters.fromDate ?? '');
    setToDate(filters.toDate ?? '');
  }, [open]);

  const currencyCodes = preferredCurrencies.length > 0 ? preferredCurrencies : CURRENCY_CODES;
  const categoryOptions = [
    { value: '', label: 'All categories' },
    ...categories.filter((c) => !c.isArchived).map((c) => ({ value: c.id, label: c.name })),
  ];
  const currencyOptions = [{ value: '', label: 'All currencies' }, ...currencyCodes.map((c) => ({ value: c, label: c }))];

  function dateRange(): { fromDate?: string; toDate?: string } {
    if (preset === 'CUSTOM') return { fromDate: fromDate || undefined, toDate: toDate || undefined };
    return presetRange(preset, new Date());
  }

  function apply() {
    onApply({
      type: filters.type,
      limit: filters.limit,
      categoryId: categoryId || undefined,
      currency: currency || undefined,
      ...dateRange(),
    });
    onClose();
  }

  function reset() {
    onApply({ type: filters.type, limit: filters.limit });
    onClose();
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Filters">
      <View className="gap-4">
        <Field label="Category">
          <Dropdown value={categoryId} options={categoryOptions} onSelect={setCategoryId} accessibilityLabel="Filter by category" />
        </Field>
        <Field label="Currency">
          <Dropdown value={currency} options={currencyOptions} onSelect={setCurrency} accessibilityLabel="Filter by currency" />
        </Field>
        <Field label="Date range">
          <Dropdown value={preset} options={DATE_PRESET_OPTIONS} onSelect={setPreset} accessibilityLabel="Date range preset" />
        </Field>
        {preset === 'CUSTOM' ? (
          <View className="flex-row gap-3">
            <View className="flex-1">
              <Field label="From">
                <DatePicker value={fromDate} onChange={setFromDate} placeholder="Start" accessibilityLabel="From date" />
              </Field>
            </View>
            <View className="flex-1">
              <Field label="To">
                <DatePicker value={toDate} onChange={setToDate} placeholder="End" accessibilityLabel="To date" />
              </Field>
            </View>
          </View>
        ) : null}
        <View className="mt-1 flex-row gap-3">
          <View className="flex-1">
            <Button variant="ghost" onPress={reset}>
              Reset
            </Button>
          </View>
          <View className="flex-1">
            <Button onPress={apply}>Apply</Button>
          </View>
        </View>
      </View>
    </BottomSheet>
  );
}
