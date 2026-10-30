import { describe, expect, it } from 'vitest';
import type { RedisService } from '../core/redis.service.js';
import { CAPTCHA_AFTER, LOCK_MS, LoginAttemptsService, MAX_FAILED } from './login-attempts.service.js';

/** Minimal in-memory stand-in for the ioredis commands the service uses. */
function fakeRedis(down = false) {
  const data = new Map<string, { v: string; exp?: number }>();
  const client = {
    get: async (k: string) => data.get(k)?.v ?? null,
    pttl: async (k: string) => (data.has(k) ? (data.get(k)!.exp ?? 0) - Date.now() : -2),
    incr: async (k: string) => {
      const n = Number(data.get(k)?.v ?? 0) + 1;
      data.set(k, { v: String(n), exp: data.get(k)?.exp });
      return n;
    },
    pexpire: async (k: string, ms: number) => {
      const e = data.get(k);
      if (e) e.exp = Date.now() + ms;
      return e ? 1 : 0;
    },
    set: async (k: string, v: string, _px: string, ms: number) => {
      data.set(k, { v, exp: Date.now() + ms });
      return 'OK';
    },
    del: async (...keys: string[]) => keys.filter((k) => data.delete(k)).length,
  };
  return { data, service: { client, ping: async () => (down ? Promise.reject(new Error('down')) : undefined) } as unknown as RedisService };
}

describe('LoginAttemptsService', () => {
  it('counts failures and locks on the 5th for 15 minutes', async () => {
    const { service, data } = fakeRedis();
    const svc = new LoginAttemptsService(service);
    for (let i = 1; i < MAX_FAILED; i++) expect(await svc.recordFailure('a@b.vn')).toEqual({ failures: i, lockedMs: 0 });
    expect(await svc.recordFailure('a@b.vn')).toEqual({ failures: MAX_FAILED, lockedMs: LOCK_MS });
    const state = await svc.state('a@b.vn');
    expect(state.failures).toBe(0);
    expect(state.lockedMs).toBeGreaterThan(LOCK_MS - 1000);
    expect([...data.keys()].some((k) => k.includes('a@b.vn'))).toBe(false); // emails are hashed in keys
  });

  it('keeps separate counters per email and resets after success', async () => {
    const { service } = fakeRedis();
    const svc = new LoginAttemptsService(service);
    for (let i = 0; i < CAPTCHA_AFTER; i++) await svc.recordFailure('x@y.vn');
    expect((await svc.state('x@y.vn')).failures).toBe(CAPTCHA_AFTER);
    expect((await svc.state('other@y.vn')).failures).toBe(0);
    await svc.reset('x@y.vn');
    expect(await svc.state('x@y.vn')).toEqual({ failures: 0, lockedMs: 0 });
  });

  it('fails open when Redis is down', async () => {
    const svc = new LoginAttemptsService(fakeRedis(true).service);
    expect(await svc.recordFailure('a@b.vn')).toEqual({ failures: 0, lockedMs: 0 });
    expect(await svc.state('a@b.vn')).toEqual({ failures: 0, lockedMs: 0 });
  });
});
