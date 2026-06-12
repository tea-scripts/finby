'use client';

import { useEffect, useRef, useState } from 'react';
import { Camera } from '@phosphor-icons/react';
import { UpgradeGate } from '@/components/billing/UpgradeGate';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { ApiError } from '@/lib/api-client';
import { extractReceipt } from '@/lib/receipts-api';
import { createTransaction, listCategories } from '@/lib/transactions-api';
import { useAuth } from '@/lib/store';
import type { Category, ReceiptExtraction, Transaction } from '@/lib/types';
import { ReceiptConfirmationCard, type ReceiptConfirmInput } from './ReceiptConfirmationCard';

type ScannerPhase =
  | { step: 'select' }
  | { step: 'uploading' }
  | { step: 'confirm'; extraction: ReceiptExtraction }
  | { step: 'error'; message: string }
  | { step: 'success' };

const SUCCESS_DISMISS_MS = 1200;

/**
 * Full receipt flow: pick/photograph an image → extract → review → log via the
 * existing transactions endpoint. Tier-gated to PRO+ at the UI level (the
 * UpgradeGate renders instead of the scanner for FREE — no API call is made).
 */
export function ReceiptScanner({
  open,
  onClose,
  onLogged,
}: {
  open: boolean;
  onClose: () => void;
  /** Fires after the transaction is logged (entry points handle follow-up). */
  onLogged: (tx: Transaction, extraction: ReceiptExtraction) => void;
}) {
  const workspace = useAuth((s) => s.workspace);
  const [phase, setPhase] = useState<ScannerPhase>({ step: 'select' });
  const [confirming, setConfirming] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const successTimer = useRef<number | null>(null);

  // Fresh state every time the sheet opens.
  useEffect(() => {
    if (open) setPhase({ step: 'select' });
  }, [open]);

  useEffect(
    () => () => {
      if (successTimer.current !== null) window.clearTimeout(successTimer.current);
    },
    [],
  );

  // Categories feed the confirmation dropdown — skip entirely for FREE tier.
  useEffect(() => {
    if (!open || !workspace || workspace.tier === 'FREE') return;
    listCategories(workspace.id)
      .then(setCategories)
      .catch(() => undefined);
  }, [open, workspace]);

  function fail(err: unknown) {
    setPhase({
      step: 'error',
      message:
        err instanceof ApiError ? err.message : 'Something went wrong. Please try again.',
    });
  }

  async function onFileSelected(file: File | undefined) {
    if (!file || !workspace) return;
    setPhase({ step: 'uploading' });
    try {
      const extraction = await extractReceipt(workspace.id, file);
      setPhase({ step: 'confirm', extraction });
    } catch (err) {
      fail(err);
    }
  }

  async function onConfirm(extraction: ReceiptExtraction, input: ReceiptConfirmInput) {
    if (!workspace || confirming) return;
    setConfirming(true);
    try {
      const tx = await createTransaction(workspace.id, {
        type: 'EXPENSE',
        amountOriginal: input.total,
        currencyOriginal: extraction.currency,
        ...(input.categoryId ? { categoryId: input.categoryId } : {}),
        merchant: extraction.merchant,
        ...(extraction.notes ? { description: extraction.notes } : {}),
        transactionDate: extraction.date,
      });
      setPhase({ step: 'success' });
      onLogged(tx, extraction);
      successTimer.current = window.setTimeout(onClose, SUCCESS_DISMISS_MS);
    } catch (err) {
      fail(err);
    } finally {
      setConfirming(false);
    }
  }

  if (!open) return null;

  return (
    <Modal open={open} onClose={onClose} title="Scan a receipt">
      <UpgradeGate requiredTier="PRO" featureName="Receipt Scanning">
        {/* capture="environment" opens the rear camera directly on mobile;
            desktop browsers ignore it and show a file picker. */}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          aria-label="Receipt photo"
          onChange={(e) => {
            void onFileSelected(e.target.files?.[0]);
            e.target.value = '';
          }}
        />

        {phase.step === 'select' && (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/10">
              <Camera size={24} weight="fill" className="text-accent" />
            </span>
            <p className="text-balance text-sm text-muted">
              Photograph the receipt or choose a photo — Finby reads the merchant, total and
              category for you to confirm.
            </p>
            <Button onClick={() => inputRef.current?.click()}>Choose photo</Button>
          </div>
        )}

        {phase.step === 'uploading' && (
          <div className="flex flex-col items-center gap-3 py-8">
            <span
              aria-hidden="true"
              className="h-6 w-6 animate-spin rounded-full border-2 border-accent/30 border-t-accent"
            />
            <p className="text-sm text-muted">Reading your receipt…</p>
          </div>
        )}

        {phase.step === 'confirm' && (
          <ReceiptConfirmationCard
            extraction={phase.extraction}
            categories={categories}
            confirming={confirming}
            onCancel={onClose}
            onConfirm={(input) => void onConfirm(phase.extraction, input)}
          />
        )}

        {phase.step === 'error' && (
          <div className="space-y-4">
            <p className="rounded-xl border border-danger/40 bg-danger/10 px-3.5 py-2.5 text-sm text-danger">
              {phase.message}
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose}>
                Close
              </Button>
              <Button onClick={() => setPhase({ step: 'select' })}>Try again</Button>
            </div>
          </div>
        )}

        {phase.step === 'success' && (
          <p className="py-8 text-center text-sm font-medium text-ink">Receipt logged ✅</p>
        )}
      </UpgradeGate>
    </Modal>
  );
}
