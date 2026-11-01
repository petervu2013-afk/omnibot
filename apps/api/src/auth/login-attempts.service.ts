// Failed-login counter and temporary lock in Redis, keyed by (hashed) email – for unknown emails too, so the lock
// never reveals whether an account exists. 5 failures → locked 15 minutes; CAPTCHA required from the 3rd failure.
// If Redis is unavailable the counter fails open (logged); the per-IP rate limit on /auth still applies.
import { createHash } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../core/redis.service.js';

export const MAX_FAILED = 5;
export const CAPTCHA_AFTER = 3;
export const LOCK_MS = 15 * 60_000;

const key = (kind: 'fail' | 'lock', email: string) => `auth:${kind}:${createHash('sha256').update(email).digest('hex').slice(0, 32)}`;

export interface AttemptState {
  failures: number;
  lockedMs: number; // remaining lock time, 0 if not locked
}

@Injectable()
export class LoginAttemptsService {
  private readonly logger = new Logger(LoginAttemptsService.name);

  constructor(private readonly redis: RedisService) {}

  private async run<T>(fallback: T, fn: () => Promise<T>): Promise<T> {
    try {
      await this.redis.ping();
      return await fn();
    } catch (err) {
      this.logger.warn(`Bộ đếm đăng nhập sai không dùng được Redis: ${(err as Error).message}`);
      return fallback;
    }
  }

  state(email: string): Promise<AttemptState> {
    return this.run({ failures: 0, lockedMs: 0 }, async () => {
      const [failures, lockedMs] = await Promise.all([this.redis.client.get(key('fail', email)), this.redis.client.pttl(key('lock', email))]);
      return { failures: Number(failures ?? 0), lockedMs: Math.max(lockedMs, 0) };
    });
  }

  /** Records a failure; returns the new state (locked when the 5th failure is reached). */
  recordFailure(email: string): Promise<AttemptState> {
    return this.run({ failures: 0, lockedMs: 0 }, async () => {
      const failures = await this.redis.client.incr(key('fail', email));
      await this.redis.client.pexpire(key('fail', email), LOCK_MS);
      if (failures < MAX_FAILED) return { failures, lockedMs: 0 };
      await this.redis.client.set(key('lock', email), '1', 'PX', LOCK_MS);
      await this.redis.client.del(key('fail', email));
      return { failures, lockedMs: LOCK_MS };
    });
  }

  reset(email: string): Promise<void> {
    return this.run(undefined, async () => {
      await this.redis.client.del(key('fail', email), key('lock', email));
    });
  }
}
