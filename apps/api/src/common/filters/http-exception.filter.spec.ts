import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import { HttpExceptionFilter } from './http-exception.filter';

jest.mock('@sentry/nestjs', () => ({ captureException: jest.fn() }));

function makeHost(req: Record<string, unknown> = {}): ArgumentsHost {
  const response = {
    status: (code: number) => {
      void code;
      return { json: (payload: Record<string, unknown>) => payload };
    },
  };
  return {
    switchToHttp: () => ({ getResponse: () => response, getRequest: () => req }),
  } as unknown as ArgumentsHost;
}

function capture(exception: unknown): { status: number; body: Record<string, unknown> } {
  let status = 0;
  let body: Record<string, unknown> = {};
  const response = {
    status: (code: number) => {
      status = code;
      return { json: (payload: Record<string, unknown>) => (body = payload) };
    },
  };
  const host = {
    switchToHttp: () => ({ getResponse: () => response, getRequest: () => ({}) }),
  } as unknown as ArgumentsHost;
  new HttpExceptionFilter().catch(exception, host);
  return { status, body };
}

describe('HttpExceptionFilter', () => {
  it('maps built-in exceptions to contract SCREAMING_SNAKE codes', () => {
    expect(capture(new NotFoundException('x')).body).toMatchObject({ statusCode: 404, error: 'NOT_FOUND' });
    expect(capture(new ConflictException('x')).body).toMatchObject({ statusCode: 409, error: 'CONFLICT' });
    expect(capture(new ServiceUnavailableException('x')).body).toMatchObject({
      statusCode: 503,
      error: 'SERVICE_UNAVAILABLE',
    });
  });

  it('honors an explicit custom code like TIER_LIMIT', () => {
    const exc = new ForbiddenException({ error: 'TIER_LIMIT', message: 'upgrade' });
    expect(capture(exc).body).toMatchObject({ statusCode: 403, error: 'TIER_LIMIT', message: 'upgrade' });
  });

  it('falls back to INTERNAL for unknown errors', () => {
    const { status, body } = capture(new Error('boom'));
    expect(status).toBe(500);
    expect(body).toMatchObject({ error: 'INTERNAL' });
  });

  it('reports unknown (5xx) errors to Sentry', () => {
    (Sentry.captureException as jest.Mock).mockClear();
    const filter = new HttpExceptionFilter();
    const host = makeHost();
    filter.catch(new Error('db exploded'), host);
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });

  it('does NOT report expected HttpExceptions (4xx) to Sentry', () => {
    (Sentry.captureException as jest.Mock).mockClear();
    const filter = new HttpExceptionFilter();
    const host = makeHost();
    filter.catch(new ForbiddenException('nope'), host);
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });
});
