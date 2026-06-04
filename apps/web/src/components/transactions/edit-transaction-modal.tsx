'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dropdown, type DropdownOption } from '@/components/ui/dropdown';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { ApiError } from '@/lib/api-client';
import { updateTransaction, voidTransaction } from '@/lib/transactions-api';
import type { Category, Transaction } from '@/lib/types';

export function EditTransactionModal({
  workspaceId,
  transaction,
  categories,
  onSaved,
  onVoided,
  onClose,
}: {
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

  const categoryOptions: DropdownOption[] = [
    { value: '', label: 'Uncategorized' },
    ...categories.filter((c) => !c.isArchived).map((c) => ({ value: c.id, label: c.name })),
  ];

  function fail(e: unknown) {
    setError(e instanceof ApiError ? e.message : 'Something went wrong.');
  }

  async function onSave() {
    setError(null);
    setSaving(true);
    try {
      const updated = await updateTransaction(workspaceId, transaction.id, {
        categoryId: categoryId || null,
        merchant: merchant.trim() || null,
        description: description.trim() || null,
        transactionDate: date,
        tags: tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
      });
      onSaved(updated);
    } catch (e) {
      fail(e);
      setSaving(false);
    }
  }

  async function onVoid() {
    setError(null);
    setVoiding(true);
    try {
      await voidTransaction(workspaceId, transaction.id);
      onVoided(transaction.id);
    } catch (e) {
      fail(e);
      setVoiding(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Edit transaction">
      <div className="space-y-4">
        <p className="font-mono text-sm text-muted">
          {transaction.type} · {transaction.amountOriginal} {transaction.currencyOriginal}
          <span className="ml-2 text-faint">(amount &amp; currency aren’t editable)</span>
        </p>

        {error && (
          <div className="rounded-xl border border-danger/40 bg-danger/10 px-3.5 py-2.5 text-sm text-danger">
            {error}
          </div>
        )}

        <Field label="Category" htmlFor="e-category">
          <Dropdown id="e-category" value={categoryId} onChange={setCategoryId} options={categoryOptions} />
        </Field>
        <Field label="Merchant" htmlFor="e-merchant">
          <Input id="e-merchant" value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder="e.g. Walmart" />
        </Field>
        <Field label="Description" htmlFor="e-description">
          <Input id="e-description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional note" />
        </Field>
        <Field label="Date" htmlFor="e-date">
          <Input id="e-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Tags" htmlFor="e-tags" hint="Comma-separated">
          <Input id="e-tags" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="food, weekly" />
        </Field>

        <div className="flex items-center justify-between gap-3 pt-1">
          {confirmVoid ? (
            <Button variant="ghost" loading={voiding} onClick={onVoid} className="border-danger/50 text-danger">
              Confirm void
            </Button>
          ) : (
            <button
              onClick={() => setConfirmVoid(true)}
              className="text-sm text-danger transition hover:underline"
            >
              Void
            </button>
          )}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={onSave} loading={saving}>
              Save
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
