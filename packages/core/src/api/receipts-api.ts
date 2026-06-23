import type { ReceiptExtraction } from '@finby/shared';
import type { AuthedFetch } from './contract';

export interface ReceiptsApi {
  /**
   * Upload a receipt photo for extraction. The API holds the image in memory
   * only (never persisted) and returns the structured draft for the user to
   * confirm — nothing is logged until they do.
   */
  extractReceipt(workspaceId: string, file: File): Promise<ReceiptExtraction>;
}

export function createReceiptsApi(authed: AuthedFetch): ReceiptsApi {
  return {
    extractReceipt(workspaceId, file) {
      const form = new FormData();
      form.append('image', file);
      return authed<ReceiptExtraction>(`/workspaces/${workspaceId}/receipts/extract`, {
        method: 'POST',
        body: form,
      });
    },
  };
}
