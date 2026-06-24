import { describe, expect, it } from 'vitest';
import { ApiError } from '@finby/core';
import { chatNotice } from './chat-notice';

describe('chatNotice', () => {
  it('maps a 429 with upgradeRequired to a limit notice with upgrade', () => {
    const n = chatNotice(new ApiError(429, 'LIMIT', 'Daily limit reached', { upgradeRequired: true }));
    expect(n).toEqual({ kind: 'limit', message: 'Daily limit reached', upgrade: true });
  });

  it('maps a 429 without upgradeRequired to a limit notice (no upgrade)', () => {
    const n = chatNotice(new ApiError(429, 'LIMIT', 'Slow down'));
    expect(n).toMatchObject({ kind: 'limit', message: 'Slow down', upgrade: false });
  });

  it('maps a 503 to a down notice', () => {
    expect(chatNotice(new ApiError(503, 'DOWN', 'Service unavailable'))).toEqual({
      kind: 'down',
      message: 'Service unavailable',
    });
  });

  it('maps a 401 to a session-expired error', () => {
    expect(chatNotice(new ApiError(401, 'UNAUTH', 'nope'))).toEqual({
      kind: 'error',
      message: 'Your session expired. Please sign in again.',
    });
  });

  it('passes other ApiError messages through as error', () => {
    expect(chatNotice(new ApiError(400, 'BAD', 'Bad input'))).toEqual({
      kind: 'error',
      message: 'Bad input',
    });
  });

  it('falls back to a generic message for non-ApiError', () => {
    expect(chatNotice(new Error('boom'))).toEqual({
      kind: 'error',
      message: 'Something went wrong. Please try again.',
    });
  });
});
