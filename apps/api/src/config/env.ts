// Environment variables of the API, validated once at startup. A missing or invalid variable stops the process
// with a message naming every offending variable (Step 1 gate).
import { z } from 'zod';

const EXAMPLE_KEY = 'A'.repeat(43) + '=';

const duration = z.string().regex(/^\d+[smhd]$/, 'dạng số + đơn vị: 900s, 15m, 12h, 30d');

/** '15m' → 900000 ms. Input is validated by the `duration` schema. */
export function durationMs(value: string): number {
  const n = Number(value.slice(0, -1));
  return n * { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 }[value.at(-1) as 's' | 'm' | 'h' | 'd'];
}

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
    JWT_ACCESS_TTL: duration.default('15m'),
    JWT_REFRESH_TTL: duration.default('30d'),
    ENCRYPTION_KEY: encryptionKey,
    // Web app base URL used in email links (verify / reset password).
    APP_URL: z.url().default('http://localhost:5173'),
    MAIL_TRANSPORT: z.enum(['smtp', 'file', 'memory']).optional(),
    MAIL_FROM: z.string().default('OmniBot <no-reply@omnibot.vn>'),
    SMTP_URL: z.url({ protocol: /^smtps?$/, message: 'phải là URL smtp://user:pass@host:587 hoặc smtps://…' }).optional(),
    // Cloudflare Turnstile secret; without it (dev/test) any non-empty captcha token is accepted.
    TURNSTILE_SECRET_KEY: z.string().min(1).optional(),
    AUTH_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(10),
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
    // Meta app (Facebook Messenger webhook). Unset: the Facebook webhook answers 404.
    META_APP_SECRET: z.string().min(16).optional(),
    META_VERIFY_TOKEN: z.string().min(16).optional(),
  })
  .transform((env) => ({
    ...env,
    // Default transport: real SMTP when configured, files under apps/api/.outbox in development, memory in tests.
    MAIL_TRANSPORT: env.MAIL_TRANSPORT ?? (env.SMTP_URL ? 'smtp' : env.NODE_ENV === 'test' ? 'memory' : 'file'),
  }))
  .superRefine((env, ctx) => {
    if (env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) {
      ctx.addIssue({ code: 'custom', path: ['JWT_REFRESH_SECRET'], message: 'phải khác JWT_ACCESS_SECRET' });
    }
    if (env.MAIL_TRANSPORT === 'smtp' && !env.SMTP_URL) ctx.addIssue({ code: 'custom', path: ['SMTP_URL'], message: 'bắt buộc khi MAIL_TRANSPORT=smtp' });
    if (env.NODE_ENV !== 'production') return;
    if (env.MAIL_TRANSPORT !== 'smtp') ctx.addIssue({ code: 'custom', path: ['SMTP_URL'], message: 'production phải gửi email thật qua SMTP' });
    if (!env.TURNSTILE_SECRET_KEY) ctx.addIssue({ code: 'custom', path: ['TURNSTILE_SECRET_KEY'], message: 'bắt buộc ở production (CAPTCHA đăng nhập)' });
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
    // Custom rules (e.g. "required in production") keep their own explanation.
    const missing = issue.code !== 'custom' && (raw[name] === undefined || raw[name] === '');
    return `${name}: ${missing ? 'thiếu biến bắt buộc' : issue.message}`;
  });
  throw new EnvValidationError(problems);
}
