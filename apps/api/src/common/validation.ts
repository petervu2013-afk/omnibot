import type { z } from 'zod';
import { apiError } from './api-error.js';

/** Validates a request body/query against a zod schema; field errors go to error.details as [{ field, message }]. */
export function parse<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input ?? {});
  if (result.success) return result.data;
  const details = result.error.issues.map((i) => ({ field: i.path.join('.') || '(body)', message: i.message }));
  throw apiError(400, 'VALIDATION_FAILED', 'Dữ liệu gửi lên không hợp lệ.', details);
}
