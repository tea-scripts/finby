import { scrubEvent, DENY_KEYS } from './scrub';
import type { ErrorEvent } from '@sentry/nestjs';

function makeEvent(over: Partial<ErrorEvent> = {}): ErrorEvent {
  return { type: undefined, ...over } as ErrorEvent;
}

describe('scrubEvent', () => {
  it('drops request body, query string, cookies and auth headers', () => {
    const event = makeEvent({
      request: {
        url: 'https://api.finby.app/x',
        data: { amount: '12.00' },
        query_string: 'q=1',
        cookies: { sid: 'abc' },
        headers: { Authorization: 'Bearer xyz', cookie: 'sid=abc', 'user-agent': 'jest' },
      },
    });
    const out = scrubEvent(event, {})!;
    expect(out.request!.data).toBeUndefined();
    expect(out.request!.query_string).toBeUndefined();
    expect(out.request!.cookies).toBeUndefined();
    expect(out.request!.headers!.Authorization).toBeUndefined();
    expect(out.request!.headers!.cookie).toBeUndefined();
    expect(out.request!.headers!['user-agent']).toBe('jest');
  });

  it('reduces user context to id only', () => {
    const out = scrubEvent(makeEvent({ user: { id: 'u1', email: 'a@b.com', username: 'a' } }), {})!;
    expect(out.user).toEqual({ id: 'u1' });
  });

  it('recursively redacts deny-listed financial/PII keys in extra/contexts', () => {
    const out = scrubEvent(
      makeEvent({
        extra: { tx: { amount: '99.50', merchant: 'KFC', note: 'ok' }, accountNumber: 'FB-123' },
        contexts: { state: { balance: '500.00' } } as unknown as ErrorEvent['contexts'],
      }),
      {},
    )!;
    const tx = (out.extra!.tx as Record<string, unknown>);
    expect(tx.amount).toBe('[redacted]');
    expect(tx.merchant).toBe('[redacted]');
    expect(tx.note).toBe('ok');
    expect(out.extra!.accountNumber).toBe('[redacted]');
    expect((out.contexts!.state as Record<string, unknown>).balance).toBe('[redacted]');
  });

  it('exposes the deny list and matches case-insensitively', () => {
    expect(DENY_KEYS).toContain('amount');
    const out = scrubEvent(makeEvent({ extra: { Amount: '1', AMOUNTBASE: '2' } }), {})!;
    expect(out.extra!.Amount).toBe('[redacted]');
    expect(out.extra!.AMOUNTBASE).toBe('[redacted]');
  });
});
