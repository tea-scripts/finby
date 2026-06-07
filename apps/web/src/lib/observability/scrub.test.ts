import { describe, it, expect } from 'vitest';
import type { ErrorEvent } from '@sentry/nextjs';
import { scrubEvent, DENY_KEYS } from './scrub';

const ev = (o: Partial<ErrorEvent> = {}): ErrorEvent => ({ type: undefined, ...o }) as ErrorEvent;

describe('scrubEvent (web)', () => {
  it('drops request data/headers and reduces user to id', () => {
    const out = scrubEvent(
      ev({
        request: { url: 'x', data: { amount: '5' }, cookies: { s: '1' }, headers: { Authorization: 'b', 'user-agent': 'v' } },
        user: { id: 'u1', email: 'a@b.com' },
      }),
      {},
    )!;
    expect(out.request!.data).toBeUndefined();
    expect(out.request!.cookies).toBeUndefined();
    expect(out.request!.headers!.Authorization).toBeUndefined();
    expect(out.request!.headers!['user-agent']).toBe('v');
    expect(out.user).toEqual({ id: 'u1' });
  });

  it('redacts deny-listed keys (case-insensitive) in extra', () => {
    expect(DENY_KEYS).toContain('balance');
    const out = scrubEvent(ev({ extra: { Balance: '9', ok: '1' } }), {})!;
    expect(out.extra!.Balance).toBe('[redacted]');
    expect(out.extra!.ok).toBe('1');
  });
});
