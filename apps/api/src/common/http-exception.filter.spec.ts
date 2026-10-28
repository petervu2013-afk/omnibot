import { BadRequestException, ConflictException, HttpException, NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { toErrorBody } from './http-exception.filter.js';

describe('toErrorBody', () => {
  it('maps unknown errors to a generic 500 without leaking details', () => {
    const { status, body } = toErrorBody(new Error('password=hunter2 at db.ts:12'), 'req-1');
    expect(status).toBe(500);
    expect(body).toEqual({ error: { code: 'INTERNAL_ERROR', message: 'Lỗi hệ thống, vui lòng thử lại sau.' }, requestId: 'req-1' });
    expect(JSON.stringify(body)).not.toContain('hunter2');
  });

  it('keeps the message of client errors', () => {
    expect(toErrorBody(new ConflictException('Email đã được sử dụng')).body.error).toEqual({ code: 'CONFLICT', message: 'Email đã được sử dụng' });
  });

  it('turns validation message lists into details', () => {
    const { status, body } = toErrorBody(new BadRequestException(['email must be an email', 'password too short']));
    expect(status).toBe(400);
    expect(body.error).toEqual({ code: 'BAD_REQUEST', message: 'Dữ liệu gửi lên không hợp lệ.', details: ['email must be an email', 'password too short'] });
  });

  it('honours a custom code', () => {
    expect(toErrorBody(new HttpException({ code: 'ACCOUNT_LOCKED', message: 'Tài khoản tạm khóa' }, 423)).body.error).toEqual({ code: 'ACCOUNT_LOCKED', message: 'Tài khoản tạm khóa' });
  });

  it('uses Vietnamese copy for 404 and 429', () => {
    expect(toErrorBody(new NotFoundException('Cannot GET /x')).body.error.message).toBe('Không tìm thấy đường dẫn hoặc dữ liệu yêu cầu.');
    expect(toErrorBody(new HttpException('ThrottlerException: Too Many Requests', 429)).body.error).toEqual({ code: 'RATE_LIMITED', message: 'Bạn thao tác quá nhanh, vui lòng thử lại sau ít phút.' });
  });
});
