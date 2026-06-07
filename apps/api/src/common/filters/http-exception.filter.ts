import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import type { Response } from 'express';

const STATUS_NAMES: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'UNPROCESSABLE',
  429: 'RATE_LIMITED',
  500: 'INTERNAL',
  503: 'SERVICE_UNAVAILABLE',
};

interface ErrorBody {
  statusCode: number;
  error: string;
  message: string;
  details?: unknown;
}

/**
 * Normalizes every thrown error into the contract's error shape:
 * { statusCode, error, message, details? }.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let details: unknown;
    let errorCode: string | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      if (status >= 500) {
        const req = host.switchToHttp().getRequest<{ id?: string }>();
        Sentry.captureException(exception, { tags: { request_id: req?.id } });
      }
      const res = exception.getResponse();
      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res !== null) {
        const record = res as Record<string, unknown>;
        if (typeof record.message === 'string') {
          message = record.message;
        } else if (Array.isArray(record.message)) {
          message = record.message.join(', ');
        } else {
          message = exception.message;
        }
        // Only honor explicit SCREAMING_SNAKE codes (e.g. TIER_LIMIT). Nest's
        // built-in `error` strings ("Not Found", "Service Unavailable") are
        // ignored so the contract's status->code map below wins.
        if (typeof record.error === 'string' && /^[A-Z][A-Z0-9_]+$/.test(record.error)) {
          errorCode = record.error;
        }
        if ('details' in record) {
          details = record.details;
        }
      }
    } else if (exception instanceof Error) {
      this.logger.error(exception.message, exception.stack);
      // Only unexpected (5xx/unknown) errors reach Sentry — expected 4xx
      // HttpExceptions are handled in the branch above and never reported.
      const req = host.switchToHttp().getRequest<{ id?: string }>();
      Sentry.captureException(exception, { tags: { request_id: req?.id } });
    }

    const body: ErrorBody = {
      statusCode: status,
      error: errorCode ?? STATUS_NAMES[status] ?? 'ERROR',
      message,
    };
    if (details !== undefined) {
      body.details = details;
    }

    response.status(status).json(body);
  }
}
