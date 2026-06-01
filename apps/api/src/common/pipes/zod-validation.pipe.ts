import { Injectable, PipeTransform, UnprocessableEntityException } from '@nestjs/common';
import type { ZodSchema } from 'zod';

/**
 * Validates and parses a request payload against a Zod schema.
 * Used in place of class-validator across all DTOs.
 */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new UnprocessableEntityException({
        message: 'Validation failed',
        details: result.error.flatten(),
      });
    }
    return result.data;
  }
}
