import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { ApiError } from '@finby/core';
import type { Category, ReceiptExtraction, SubscriptionTier, Transaction } from '@finby/shared';
import { BottomSheet } from '../ui/bottom-sheet';
import { Button } from '../ui/button';
import { UpgradeGate } from '../settings/upgrade-gate';
import { useAuthStore } from '../../lib/use-auth-store';
import { api } from '../../lib/runtime.native';
import { pickImage } from '../../lib/image-picker';
import { ReceiptConfirmationCard, type ReceiptConfirmInput } from './receipt-confirmation-card';

type Phase =
  | { step: 'select' }
  | { step: 'uploading' }
  | { step: 'confirm'; extraction: ReceiptExtraction }
  | { step: 'error'; message: string }
  | { step: 'success' };

const SUCCESS_DISMISS_MS = 1200;

function errorMessage(err: unknown): string {
  return err instanceof ApiError ? err.message : 'Something went wrong. Please try again.';
}

/**
 * Full mobile receipt flow: pick/photograph an image → extract → review → log
 * via the existing transactions endpoint. Tier-gated to PRO+ at the UI level
 * (UpgradeGate renders instead of the flow for FREE — no API call is made).
 */
export function ReceiptScannerSheet({
  open,
  onClose,
  onLogged,
}: {
  open: boolean;
  onClose: () => void;
  /** Fires after the transaction is logged (chat handles the follow-up note). */
  onLogged: (tx: Transaction, extraction: ReceiptExtraction) => void;
}) {
  const workspace = useAuthStore((s) => s.workspace);
  const tier = (workspace?.tier ?? 'FREE') as SubscriptionTier;
  const [phase, setPhase] = useState<Phase>({ step: 'select' });
  const [permDenied, setPermDenied] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fresh state every time the sheet opens.
  useEffect(() => {
    if (open) {
      setPhase({ step: 'select' });
      setPermDenied(false);
    }
  }, [open]);

  useEffect(
    () => () => {
      if (successTimer.current) clearTimeout(successTimer.current);
    },
    [],
  );

  // Categories feed the confirmation dropdown — skip entirely for FREE tier.
  useEffect(() => {
    if (!open || !workspace || tier === 'FREE') return;
    api.transactions
      .listCategories(workspace.id)
      .then(setCategories)
      .catch(() => undefined);
  }, [open, workspace, tier]);

  async function choose(source: 'camera' | 'library') {
    if (!workspace) return;
    setPermDenied(false);
    const res = await pickImage(source);
    if (res.status === 'denied') {
      setPermDenied(true);
      return;
    }
    if (res.status === 'canceled') return;
    setPhase({ step: 'uploading' });
    try {
      // RN has no File; the picker object is the multipart body (see image-picker).
      const extraction = await api.receipts.extractReceipt(workspace.id, res.file as unknown as File);
      setPhase({ step: 'confirm', extraction });
    } catch (err) {
      setPhase({ step: 'error', message: errorMessage(err) });
    }
  }

  async function confirm(extraction: ReceiptExtraction, input: ReceiptConfirmInput) {
    if (!workspace || confirming) return;
    setConfirming(true);
    try {
      const tx = await api.transactions.createTransaction(workspace.id, {
        type: 'EXPENSE',
        amountOriginal: input.total,
        currencyOriginal: extraction.currency,
        ...(input.categoryId ? { categoryId: input.categoryId } : {}),
        ...(input.merchant ? { merchant: input.merchant } : {}),
        ...(extraction.notes ? { description: extraction.notes } : {}),
        transactionDate: extraction.date,
      });
      setPhase({ step: 'success' });
      onLogged(tx, extraction);
      successTimer.current = setTimeout(onClose, SUCCESS_DISMISS_MS);
    } catch (err) {
      setPhase({ step: 'error', message: errorMessage(err) });
    } finally {
      setConfirming(false);
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Scan a receipt">
      <UpgradeGate currentTier={tier} requiredTier="PRO">
        {phase.step === 'select' ? (
          <View className="gap-3 py-2">
            <Text className="text-center text-sm text-muted">
              Photograph the receipt or choose a photo — Finby reads the merchant, total and
              category for you to confirm.
            </Text>
            <Button onPress={() => void choose('camera')}>Take photo</Button>
            <Button variant="ghost" onPress={() => void choose('library')}>
              Choose from library
            </Button>
            {permDenied ? (
              <Text className="text-center text-sm text-warn">
                Permission needed — please enable camera/photos access for Finby in Settings.
              </Text>
            ) : null}
          </View>
        ) : null}

        {phase.step === 'uploading' ? (
          <View className="items-center gap-3 py-8">
            <ActivityIndicator color="#1d6ef5" />
            <Text className="text-sm text-muted">Reading your receipt…</Text>
          </View>
        ) : null}

        {phase.step === 'confirm' ? (
          <ReceiptConfirmationCard
            extraction={phase.extraction}
            categories={categories}
            confirming={confirming}
            onCancel={onClose}
            onConfirm={(input) => void confirm(phase.extraction, input)}
          />
        ) : null}

        {phase.step === 'error' ? (
          <View className="gap-4">
            <Text className="rounded-xl border border-danger/40 bg-danger/10 px-3.5 py-2.5 text-sm text-danger">
              {phase.message}
            </Text>
            <View className="flex-row justify-end gap-2">
              <View className="flex-1">
                <Button variant="ghost" onPress={onClose}>
                  Close
                </Button>
              </View>
              <View className="flex-1">
                <Button onPress={() => setPhase({ step: 'select' })}>Try again</Button>
              </View>
            </View>
          </View>
        ) : null}

        {phase.step === 'success' ? (
          <Text className="py-8 text-center text-sm font-medium text-ink">Receipt logged ✅</Text>
        ) : null}
      </UpgradeGate>
    </BottomSheet>
  );
}
