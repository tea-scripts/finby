import { useState } from 'react';
import { Text, View } from 'react-native';
import type { Category, ReceiptExtraction } from '@finby/shared';
import { Button } from '../ui/button';
import { Dropdown } from '../ui/dropdown';
import { Field } from '../ui/field';
import { Input } from '../ui/input';
import { resolveCategoryId } from './receipt-category';

export interface ReceiptConfirmInput {
  /** The (possibly user-corrected) total as a decimal string. */
  total: string;
  /** The (possibly user-corrected) merchant name — '' when cleared. */
  merchant: string;
  categoryId: string | null;
}

/**
 * Review step between extraction and logging. Total and merchant are editable
 * (vision confidence is imperfect, and receipts often print the franchise
 * corporation instead of the brand) and the category can be corrected — nothing
 * is logged until the user confirms.
 */
export function ReceiptConfirmationCard({
  extraction,
  categories,
  confirming,
  onConfirm,
  onCancel,
}: {
  extraction: ReceiptExtraction;
  categories: Category[];
  confirming: boolean;
  onConfirm: (input: ReceiptConfirmInput) => void;
  onCancel: () => void;
}) {
  const [total, setTotal] = useState(String(extraction.total));
  const [merchant, setMerchant] = useState(extraction.merchant);
  const [categoryId, setCategoryId] = useState(() => resolveCategoryId(categories, extraction.category));

  const categoryOptions = [
    { value: '', label: 'Uncategorized' },
    ...categories.filter((c) => !c.isArchived).map((c) => ({ value: c.id, label: c.name })),
  ];

  const totalValid = /^\d+(\.\d+)?$/.test(total.trim()) && Number(total) > 0;

  return (
    <View className="gap-4">
      <View className="flex-row items-center justify-between">
        <Text className="text-xs text-muted">{extraction.date}</Text>
        <Text className="font-mono text-sm text-muted">{extraction.currency}</Text>
      </View>

      <Field
        label="Merchant"
        hint="Receipts often show the franchise company — rename it to what you'll remember."
      >
        <Input
          testID="receipt-merchant"
          value={merchant}
          onChangeText={setMerchant}
          placeholder="Where was this?"
        />
      </Field>

      <Field label={`Total (${extraction.currency})`}>
        <Input
          testID="receipt-total"
          keyboardType="decimal-pad"
          value={total}
          invalid={!totalValid}
          onChangeText={setTotal}
        />
      </Field>

      <Field label="Category">
        <Dropdown
          accessibilityLabel="Category"
          value={categoryId}
          onSelect={setCategoryId}
          options={categoryOptions}
        />
      </Field>

      {extraction.showLineItems && extraction.lineItems.length > 0 ? (
        <View className="gap-1.5 rounded-xl border border-line bg-canvas/40 p-3">
          {extraction.lineItems.map((item, i) => (
            <View key={`${item.name}-${i}`} className="flex-row justify-between gap-3">
              <Text className="flex-1 text-sm text-muted" numberOfLines={1}>
                {item.name}
              </Text>
              <Text className="font-mono text-sm text-ink">{item.amount.toFixed(2)}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {extraction.confidence < 0.5 ? (
        <Text className="rounded-xl border border-warn/40 bg-warn/10 px-3.5 py-2.5 text-sm text-warn">
          ⚠️ We're not fully confident in this total — please verify.
        </Text>
      ) : null}

      {extraction.notes ? <Text className="text-xs text-faint">{extraction.notes}</Text> : null}

      <View className="flex-row gap-2 pt-1">
        <View className="flex-1">
          <Button variant="ghost" onPress={onCancel} disabled={confirming}>
            Cancel
          </Button>
        </View>
        <View className="flex-1">
          <Button
            onPress={() =>
              onConfirm({ total: total.trim(), merchant: merchant.trim(), categoryId: categoryId || null })
            }
            loading={confirming}
            disabled={!totalValid}
          >
            Log Transaction
          </Button>
        </View>
      </View>
    </View>
  );
}
