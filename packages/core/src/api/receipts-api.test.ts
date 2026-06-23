import { describe, expect, it, vi } from 'vitest';
import { createReceiptsApi } from './receipts-api';

describe('createReceiptsApi', () => {
  it('extractReceipt POSTs a FormData body to the extract endpoint', async () => {
    const authed = vi.fn(async (_path: string, _init?: RequestInit) => ({} as never));
    const file = new File(['x'], 'r.png', { type: 'image/png' });
    await createReceiptsApi(authed).extractReceipt('ws1', file);
    expect(authed).toHaveBeenCalledTimes(1);
    const [path, init] = authed.mock.calls[0]!;
    expect(path).toBe('/workspaces/ws1/receipts/extract');
    expect(init?.method).toBe('POST');
    expect(init?.body).toBeInstanceOf(FormData);
    expect((init!.body as FormData).get('image')).toBe(file);
  });
});
