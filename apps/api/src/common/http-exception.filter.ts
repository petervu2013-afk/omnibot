// One error shape for every response: { error: { code, message, details? }, requestId }.
// Unexpected errors are logged with their stack but never leak internals to the client.
import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Response } from 'express';
import type { RequestWithId } from './request-context.js';

const CODES: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  405: 'METHOD_NOT_ALLOWED',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  422: 'VALIDATION_FAILED',
  429: 'RATE_LIMITED',
  500: 'INTERNAL_ERROR',
  503: 'SERVICE_UNAVAILABLE',
};

const MESSAGES: Record<number, string> = {
  404: 'Không tìm thấy đường dẫn hoặc dữ liệu yêu cầu.',
  429: 'Bạn thao tác quá nhanh, vui lòng thử lại sau ít phút.',
  500: 'Lỗi hệ thống, vui lòng thử lại sau.',
};

export interface ErrorBody {
  error: { code: string; message: string; details?: unknown };
  requestId?: string;
}

export function toErrorBody(exception: unknown, requestId?: string): { status: number; body: ErrorBody } {
  if (!(exception instanceof HttpException)) {
    return { status: 500, body: { error: { code: CODES[500]!, message: MESSAGES[500]! }, requestId } };
  }
  const status = exception.getStatus();
  const res = exception.getResponse();
  const r = typeof res === 'string' ? { message: res } : (res as { message?: unknown; code?: string; details?: unknown });
  const code = r.code ?? CODES[status] ?? `HTTP_${status}`;
  let message = MESSAGES[status] ?? (typeof r.message === 'string' ? r.message : exception.message);
  let details = r.details;
  // class-validator style: message is a list of field errors.
  if (Array.isArray(r.message)) {
    details = r.message;
    message = 'Dữ liệu gửi lên không hợp lệ.';
  } else if (status < 500 && typeof r.message === 'string' && !MESSAGES[status]) {
    message = r.message;
  }
  return { status, body: { error: { code, message, ...(details === undefined ? {} : { details }) }, requestId } };
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const req = http.getRequest<RequestWithId>();
    const res = http.getResponse<Response>();
    const { status, body } = toErrorBody(exception, req.id);
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      const err = exception instanceof Error ? exception : new Error(String(exception));
      this.logger.error(`${req.method} ${req.originalUrl} → ${status} [${req.id}] ${err.message}`, err.stack);
    }
    res.status(status).json(body);
  }
}
