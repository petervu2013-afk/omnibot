import { describe, expect, it } from 'vitest';
import { EnvValidationError, validateEnv } from './env.js';

const valid = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
  JWT_ACCESS_SECRET: 'a'.repeat(40),
  JWT_REFRESH_SECRET: 'b'.repeat(40),
  ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
};

function problems(raw: Record<string, unknown>): string[] {
  try {
    validateEnv(raw);
  } catch (e) {
    if (e instanceof EnvValidationError) return e.problems;
    throw e;
  }
  return [];
}

describe('validateEnv', () => {
  it('accepts a complete environment and applies defaults', () => {
    const env = validateEnv(valid);
    expect(env.PORT).toBe(3000);
    expect(env.NODE_ENV).toBe('development');
    expect(env.CORS_ORIGINS).toEqual(['http://localhost:5173', 'http://localhost:8081']);
    expect(env.RATE_LIMIT_PER_MINUTE).toBe(120);
  });

  it('names every missing required variable', () => {
    const list = problems({});
    for (const name of ['DATABASE_URL', 'REDIS_URL', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'ENCRYPTION_KEY']) {
      expect(list).toContain(`${name}: thiếu biến bắt buộc`);
    }
  });

  it('rejects malformed values with a reason', () => {
    const list = problems({ ...valid, DATABASE_URL: 'mysql://x', ENCRYPTION_KEY: 'short', JWT_ACCESS_SECRET: 'tiny', PORT: '70000' });
    expect(list.some((p) => p.startsWith('DATABASE_URL: phải là URL postgresql'))).toBe(true);
    expect(list.some((p) => p.startsWith('ENCRYPTION_KEY: phải là khóa 32 byte'))).toBe(true);
    expect(list.some((p) => p.startsWith('JWT_ACCESS_SECRET:'))).toBe(true);
    expect(list.some((p) => p.startsWith('PORT:'))).toBe(true);
  });

  it('requires different access and refresh secrets', () => {
    expect(problems({ ...valid, JWT_REFRESH_SECRET: valid.JWT_ACCESS_SECRET })).toEqual(['JWT_REFRESH_SECRET: phải khác JWT_ACCESS_SECRET']);
  });

  it('refuses the .env.example placeholders in production only', () => {
    const example = { ...valid, ENCRYPTION_KEY: 'A'.repeat(43) + '=', JWT_ACCESS_SECRET: 'change-me-access-secret-at-least-32-chars' };
    expect(problems(example)).toEqual([]);
    const list = problems({ ...example, NODE_ENV: 'production' });
    expect(list).toContain('ENCRYPTION_KEY: đang dùng khóa mẫu trong .env.example');
    expect(list).toContain('JWT_ACCESS_SECRET: đang dùng giá trị mẫu trong .env.example');
  });

  it('splits CORS_ORIGINS', () => {
    expect(validateEnv({ ...valid, CORS_ORIGINS: 'https://a.vn, https://b.vn ,' }).CORS_ORIGINS).toEqual(['https://a.vn', 'https://b.vn']);
  });
});
