import { z, type ZodSchema } from 'zod';
import type { FieldError } from '@edgeflow/types';

export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  errors?: FieldError[];
}

/**
 * Validates input against a Zod schema and throws a structured error on failure.
 * Use inside service/application layers to ensure data contracts are met.
 */
export function validateOrThrow<T>(schema: ZodSchema<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (result.success) {
    return result.data;
  }
  const errors = formatZodErrors(result.error);
  const error = new ValidationError('Validation failed', errors);
  throw error;
}

/**
 * Formats Zod validation errors into our canonical FieldError shape.
 */
export function formatZodErrors(error: z.ZodError): FieldError[] {
  return error.errors.map((issue) => ({
    field: issue.path.join('.'),
    message: issue.message,
    code: issue.code,
  }));
}

export class ValidationError extends Error {
  readonly errors: FieldError[];

  constructor(message: string, errors: FieldError[]) {
    super(message);
    this.name = 'ValidationError';
    this.errors = errors;
  }
}
