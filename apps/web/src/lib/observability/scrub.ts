import type { ErrorEvent, EventHint } from '@sentry/nextjs';

export const DENY_KEYS = [
  'amount', 'amountbase', 'amountlimit', 'amountspent', 'balance', 'pricebase',
  'merchant', 'accountnumber', 'email', 'password', 'token', 'secret', 'refreshtoken',
];

function redactDeep(value: unknown, depth = 0): unknown {
  if (value == null || depth > 6) return value;
  if (Array.isArray(value)) return value.map((v) => redactDeep(v, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = DENY_KEYS.includes(k.toLowerCase()) ? '[redacted]' : redactDeep(v, depth + 1);
    }
    return out;
  }
  return value;
}

export function scrubEvent(event: ErrorEvent, _hint: EventHint): ErrorEvent | null {
  try {
    if (event.request) {
      delete event.request.data;
      delete event.request.query_string;
      delete event.request.cookies;
      const h = event.request.headers;
      if (h) {
        for (const key of Object.keys(h)) {
          if (['authorization', 'cookie'].includes(key.toLowerCase())) delete h[key];
        }
      }
    }
    if (event.user) event.user = event.user.id ? { id: event.user.id } : undefined;
    if (event.extra) event.extra = redactDeep(event.extra) as ErrorEvent['extra'];
    if (event.contexts) event.contexts = redactDeep(event.contexts) as ErrorEvent['contexts'];
    return event;
  } catch {
    return null;
  }
}
