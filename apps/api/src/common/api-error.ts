import { HttpException } from '@nestjs/common';

/** Business error with a stable machine code; rendered by AllExceptionsFilter as { error: { code, message, details } }. */
export function apiError(status: number, code: string, message: string, details?: unknown): HttpException {
  return new HttpException({ code, message, ...(details === undefined ? {} : { details }) }, status);
}
