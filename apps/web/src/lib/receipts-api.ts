import { useAuth } from './store';
import type { ReceiptExtraction } from './types';

/**
 * Upload a receipt photo for extraction. The API holds the image in memory
 * only (never persisted) and returns the structured draft for the user to
 * confirm — nothing is logged until they do.
 */
export function extractReceipt(workspaceId: string, file: File): Promise<ReceiptExtraction> {
  const form = new FormData();
  form.append('image', file);
  return useAuth.getState().authed<ReceiptExtraction>(
    `/workspaces/${workspaceId}/receipts/extract`,
    { method: 'POST', body: form },
  );
}
