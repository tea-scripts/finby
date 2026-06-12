'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dropdown, type DropdownOption } from '@/components/ui/dropdown';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import type { Category, ReceiptExtraction } from '@/lib/types';

export interface ReceiptConfirmInput {
  /** The (possibly user-corrected) total as a decimal string. */
  total: string;
  categoryId: string | null;
}

/** Map the model's category name onto the workspace's real categories;
 *  unknown names land on "Other" (or uncategorized if that's missing too). */
function resolveCategoryId(categories: Category[], name: string): string {
  const active = categories.filter((c) => !c.isArchived);
  const match = active.find((c) => c.name.toLowerCase() === name.toLowerCase());
  if (match) return match.id;
  return active.find((c) => c.name.toLowerCase() === 'other')?.id ?? '';
}

/**
 * Review step between extraction and logging. The total is editable (vision
 * confidence is imperfect) and the category can be corrected — nothing is
 * logged until the user explicitly confirms.
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
  const [categoryId, setCategoryId] = useState(() =>
    resolveCategoryId(categories, extraction.category),
  );

  const categoryOptions: DropdownOption[] = [
    { value: '', label: 'Uncategorized' },
    ...categories.filter((c) => !c.isArchived).map((c) => ({ value: c.id, label: c.name })),
  ];

  const totalValid = /^\d+(\.\d+)?$/.test(total.trim()) && Number(total) > 0;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-display text-base font-semibold text-ink">
            {extraction.merchant}
          </p>
          <p className="text-xs text-muted">{extraction.date}</p>
        </div>
        <p className="shrink-0 font-mono text-sm text-muted">{extraction.currency}</p>
      </div>

      <Field label={`Total (${extraction.currency})`} htmlFor="receipt-total">
        <Input
          id="receipt-total"
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0"
          value={total}
          invalid={!totalValid}
          onChange={(e) => setTotal(e.target.value)}
        />
      </Field>

      <Field label="Category" htmlFor="receipt-category">
        <Dropdown
          id="receipt-category"
          aria-label="Category"
          value={categoryId}
          onChange={setCategoryId}
          options={categoryOptions}
        />
      </Field>

      {extraction.showLineItems && extraction.lineItems.length > 0 && (
        <div className="rounded-xl border border-line bg-canvas/40 p-3">
          <ul className="space-y-1.5">
            {extraction.lineItems.map((item, i) => (
              <li key={`${item.name}-${i}`} className="flex justify-between gap-3 text-sm">
                <span className="truncate text-muted">{item.name}</span>
                <span className="shrink-0 font-mono text-ink">{item.amount.toFixed(2)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {extraction.confidence < 0.5 && (
        <p className="rounded-xl border border-warn/40 bg-warn/10 px-3.5 py-2.5 text-sm text-warn">
          ⚠️ We&rsquo;re not fully confident in this total — please verify.
        </p>
      )}

      {extraction.notes && <p className="text-xs text-faint">{extraction.notes}</p>}

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" onClick={onCancel} disabled={confirming}>
          Cancel
        </Button>
        <Button
          onClick={() => onConfirm({ total: total.trim(), categoryId: categoryId || null })}
          loading={confirming}
          disabled={!totalValid}
        >
          Log Transaction
        </Button>
      </div>
    </div>
  );
}
