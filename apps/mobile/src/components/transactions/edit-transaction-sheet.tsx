import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { ApiError } from '@finby/core';
import type { Category, Transaction } from '@finby/shared';
import { api } from '../../lib/runtime.native';
import { Button } from '../ui/button';
import { Dropdown } from '../ui/dropdown';
import { Field } from '../ui/field';
import { Input } from '../ui/input';
import { DatePicker } from '../ui/date-picker';
import { BottomSheet } from '../ui/bottom-sheet';

export function EditTransactionSheet({
  open,
  workspaceId,
  transaction,
  categories,
  onSaved,
  onVoided,
  onClose,
}: {
  open: boolean;
  workspaceId: string;
  transaction: Transaction;
  categories: Category[];
  onSaved: (tx: Transaction) => void;
  onVoided: (id: string) => void;
  onClose: () => void;
}) {
  const [categoryId, setCategoryId] = useState(transaction.category?.id ?? '');
  const [merchant, setMerchant] = useState(transaction.merchant ?? '');
  const [description, setDescription] = useState(transaction.description ?? '');
  const [date, setDate] = useState(transaction.transactionDate.slice(0, 10));
  const [tags, setTags] = useState(transaction.tags.join(', '));
  const [saving, setSaving] = useState(false);
  const [voiding, setVoiding] = useState(false);
  const [confirmVoid, setConfirmVoid] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-seed the form each time a (possibly different) transaction opens.
  useEffect(() => {
    if (!open) return;
    setCategoryId(transaction.category?.id ?? '');
    setMerchant(transaction.merchant ?? '');
    setDescription(transaction.description ?? '');
    setDate(transaction.transactionDate.slice(0, 10));
    setTags(transaction.tags.join(', '));
    setConfirmVoid(false);
    setError(null);
  }, [open, transaction]);

  const categoryOptions = [
    { value: '', label: 'Uncategorized' },
    ...categories.filter((c) => !c.isArchived).map((c) => ({ value: c.id, label: c.name })),
  ];

  function fail(e: unknown) {
    setError(e instanceof ApiError ? e.message : 'Something went wrong.');
  }

  async function save() {
    setError(null);
    setSaving(true);
    try {
      const updated = await api.transactions.updateTransaction(workspaceId, transaction.id, {
        categoryId: categoryId || null,
        merchant: merchant.trim() || null,
        description: description.trim() || null,
        transactionDate: date,
        tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
      });
      onSaved(updated);
    } catch (e) {
      fail(e);
      setSaving(false);
    }
  }

  async function doVoid() {
    setError(null);
    setVoiding(true);
    try {
      await api.transactions.voidTransaction(workspaceId, transaction.id);
      onVoided(transaction.id);
    } catch (e) {
      fail(e);
      setVoiding(false);
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Edit transaction">
      <View className="gap-4">
        <Text className="text-xs text-faint">
          {transaction.type} · {transaction.amountOriginal} {transaction.currencyOriginal} (amount isn't editable)
        </Text>
        {error ? (
          <View className="rounded-xl border border-danger/40 bg-danger/10 px-3.5 py-2.5">
            <Text className="text-sm text-danger">{error}</Text>
          </View>
        ) : null}
        <Field label="Category">
          <Dropdown value={categoryId} options={categoryOptions} onSelect={setCategoryId} accessibilityLabel="Category" />
        </Field>
        <Field label="Merchant">
          <Input value={merchant} onChangeText={setMerchant} placeholder="e.g. Walmart" />
        </Field>
        <Field label="Description">
          <Input value={description} onChangeText={setDescription} placeholder="Optional note" />
        </Field>
        <Field label="Date">
          <DatePicker value={date} onChange={setDate} accessibilityLabel="Transaction date" />
        </Field>
        <Field label="Tags" hint="Comma-separated">
          <Input value={tags} onChangeText={setTags} placeholder="food, weekly" />
        </Field>
        <View className="mt-1 flex-row items-center justify-between">
          {confirmVoid ? (
            <Pressable onPress={() => void doVoid()} accessibilityRole="button" disabled={voiding}>
              <Text className="text-sm font-medium text-danger">{voiding ? 'Voiding…' : 'Confirm void'}</Text>
            </Pressable>
          ) : (
            <Pressable onPress={() => setConfirmVoid(true)} accessibilityRole="button">
              <Text className="text-sm text-danger">Void</Text>
            </Pressable>
          )}
          <View className="flex-row gap-2">
            <Button variant="ghost" onPress={onClose}>
              Cancel
            </Button>
            <Button onPress={() => void save()} loading={saving}>
              Save
            </Button>
          </View>
        </View>
      </View>
    </BottomSheet>
  );
}
