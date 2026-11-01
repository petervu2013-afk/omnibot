import type { ConfigService } from '@nestjs/config';
import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import type { Env } from '../config/env.js';
import { AccessTokenService } from './access-token.service.js';
import { slugify } from './auth.service.js';
import { hashToken, normalizeEmail, randomToken, safeEqual } from './tokens.js';

const config = (secret: string, ttl = '15m') => ({ get: (k: string) => ({ JWT_ACCESS_SECRET: secret, JWT_ACCESS_TTL: ttl })[k] }) as unknown as ConfigService<Env, true>;

describe('opaque tokens', () => {
  it('are 256-bit, url-safe and unique', () => {
    const a = randomToken();
    expect(a).toMatch(/^[\w-]{43}$/);
    expect(new Set(Array.from({ length: 200 }, randomToken)).size).toBe(200);
  });

  it('are stored as a keyed hash that depends on the server secret', () => {
    const t = randomToken();
    expect(hashToken('secret-1', t)).toBe(hashToken('secret-1', t));
    expect(hashToken('secret-2', t)).not.toBe(hashToken('secret-1', t));
    expect(hashToken('secret-1', t)).not.toContain(t);
  });

  it('compares in constant time and handles different lengths', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });

  it('normalises emails', () => {
    expect(normalizeEmail('  Minh.Anh@GoViet.VN ')).toBe('minh.anh@goviet.vn');
  });
});

describe('AccessTokenService', () => {
  const secret = 'x'.repeat(40);

  it('signs and verifies sub + sid', async () => {
    const svc = new AccessTokenService(config(secret));
    const { token, expiresAt } = await svc.sign({ sub: 'user-1', sid: 'family-1' });
    expect(expiresAt.getTime() - Date.now()).toBeGreaterThan(14 * 60_000);
    expect(await svc.verify(token)).toEqual({ sub: 'user-1', sid: 'family-1' });
  });

  it('rejects tokens signed with another secret, tampered or expired', async () => {
    const svc = new AccessTokenService(config(secret));
    const other = new AccessTokenService(config('y'.repeat(40)));
    const { token } = await other.sign({ sub: 'u', sid: 's' });
    expect(await svc.verify(token)).toBeNull();
    const own = (await svc.sign({ sub: 'u', sid: 's' })).token;
    const [h, p, s] = own.split('.');
    const forgedPayload = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(p!, 'base64url').toString()), sub: 'admin' })).toString('base64url');
    expect(await svc.verify(`${h}.${forgedPayload}.${s}`)).toBeNull();
    const expired = await new SignJWT({ sid: 's' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('u')
      .setIssuer('omnibot-api')
      .setAudience('omnibot')
      .setExpirationTime(Math.floor(Date.now() / 1000) - 10)
      .sign(new TextEncoder().encode(secret));
    expect(await svc.verify(expired)).toBeNull();
    expect(await svc.verify('not.a.jwt')).toBeNull();
  });

  it('refuses the "none" algorithm', async () => {
    const svc = new AccessTokenService(config(secret));
    const none = `${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from('{"sub":"u","sid":"s","iss":"omnibot-api","aud":"omnibot"}').toString('base64url')}.`;
    expect(await svc.verify(none)).toBeNull();
  });
});

describe('slugify', () => {
  it('builds an ASCII slug with a random suffix', () => {
    expect(slugify('Nội Thất Gỗ Việt – Đà Nẵng')).toMatch(/^noi-that-go-viet-da-nang-[0-9a-f]{6}$/);
    expect(slugify('!!!')).toMatch(/^shop-[0-9a-f]{6}$/);
  });
});
