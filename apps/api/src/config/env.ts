// Environment variables of the API, validated once at startup. A missing or invalid variable stops the process
// with a message naming every offending variable (Step 1 gate).
import { z } from 'zod';

const EXAMPLE_KEY = 'A'.repeat(43) + '=';

const encryptionKey = z.string().refine((v) => Buffer.from(v, 'base64').length === 32, {
  message: 'phải là khóa 32 byte dạng base64 (tạo bằng: openssl rand -base64 32)',
});

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'log', 'debug', 'verbose']).default('log'),
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/, message: 'phải là URL postgresql://…' }),
    REDIS_URL: z.url({ protocol: /^rediss?$/, message: 'phải là URL redis://… hoặc rediss://…' }),
    JWT_ACCESS_SECRET: z.string().min(32, 'cần tối thiểu 32 ký tự'),
    JWT_REFRESH_SECRET: z.string().min(32, 'cần tối thiểu 32 ký tự'),
    JWT_ACCESS_TTL: z.string().default('15m'),
    JWT_REFRESH_TTL: z.string().default('30d'),
    ENCRYPTION_KEY: encryptionKey,
    CORS_ORIGINS: z
      .string()
      .default('http://localhost:5173,http://localhost:8081')
      .transform((v) =>
        v
          .split(',')
          .map((o) => o.trim())
          .filter(Boolean),
      ),
    RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(120),
  })
  .superRefine((env, ctx) => {
    if (env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) {
      ctx.addIssue({ code: 'custom', path: ['JWT_REFRESH_SECRET'], message: 'phải khác JWT_ACCESS_SECRET' });
    }
    if (env.NODE_ENV !== 'production') return;
    // Values copied from .env.example must never reach production.
    if (env.ENCRYPTION_KEY === EXAMPLE_KEY) ctx.addIssue({ code: 'custom', path: ['ENCRYPTION_KEY'], message: 'đang dùng khóa mẫu trong .env.example' });
    for (const k of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'] as const) {
      if (env[k].startsWith('change-me')) ctx.addIssue({ code: 'custom', path: [k], message: 'đang dùng giá trị mẫu trong .env.example' });
    }
  });

export type Env = z.infer<typeof envSchema>;

export class EnvValidationError extends Error {
  constructor(readonly problems: string[]) {
    super(`Cấu hình môi trường không hợp lệ (xem apps/api/.env.example):\n${problems.map((p) => `  - ${p}`).join('\n')}`);
    this.name = 'EnvValidationError';
  }
}

export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (result.success) return result.data;
  const problems = result.error.issues.map((issue) => {
    const name = issue.path.join('.');
    const missing = raw[name] === undefined || raw[name] === '';
    return `${name}: ${missing ? 'thiếu biến bắt buộc' : issue.message}`;
  });
  throw new EnvValidationError(problems);
}
