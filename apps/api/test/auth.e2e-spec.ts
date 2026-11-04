// AUTH-01…06, 13, 17 end-to-end against PostgreSQL + Redis (Step 2 test cases).
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AccountPurgeService } from '../src/auth/account-purge.service.js';
import { PrismaService } from '../src/core/prisma.service.js';
import { MailService } from '../src/mail/mail.service.js';
import { CapturingLogger, createTestApp } from './support/app.js';

const PASSWORD = 'Gỗ-Việt-2026-an-toàn';
const NEW_PASSWORD = 'Mat-khau-moi-2026';
const run = Date.now().toString(36);
let n = 0;
const newEmail = () => `chu.shop.${run}.${++n}@example.vn`;

describe('auth flows', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let mail: MailService;
  const logger = new CapturingLogger();
  const secrets: string[] = [PASSWORD, NEW_PASSWORD];
  const api = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp({}, { logger });
    prisma = app.get(PrismaService);
    mail = app.get(MailService);
  });
  afterAll(async () => {
    await app?.close();
  });

  const lastLink = (to: string, path: 'verify' | 'reset') => {
    const m = [...mail.outbox].reverse().find((x) => x.to === to && x.text.includes(`#/${path}?token=`));
    const token = m?.text.match(/token=([\w-]+)/)?.[1];
    if (!token) throw new Error(`no ${path} mail for ${to}`);
    secrets.push(token);
    return token;
  };

  async function register(email = newEmail(), extra: Record<string, unknown> = {}) {
    const res = await api()
      .post('/v1/auth/register')
      .send({ fullName: 'Nguyễn Minh Anh', email, password: PASSWORD, shopName: 'Nội Thất Gỗ Việt', field: 'Nội thất', acceptTerms: true, platform: 'ANDROID', ...extra });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    secrets.push(res.body.accessToken, res.body.refreshToken);
    return { email, ...res.body } as { email: string; accessToken: string; refreshToken: string; user: { id: string } };
  }

  async function login(email: string, password = PASSWORD, extra: Record<string, unknown> = {}) {
    const res = await api()
      .post('/v1/auth/login')
      .send({ email, password, platform: 'IOS', deviceName: 'iPhone test', ...extra });
    if (res.body.accessToken) secrets.push(res.body.accessToken, res.body.refreshToken);
    return res;
  }

  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  describe('AUTH-01 register', () => {
    it('creates user + shop + ADMIN membership, signs in and sends the verification email', async () => {
      const r = await register();
      expect(r.accessToken).toBeTruthy();
      expect(r.refreshToken).toBeTruthy();
      expect(r).toMatchObject({ user: { email: r.email, emailVerifiedAt: null, status: 'ACTIVE' }, shops: [{ name: 'Nội Thất Gỗ Việt', role: 'ADMIN' }] });
      const shop = await prisma.system.shop.findFirstOrThrow({ where: { ownerId: r.user.id } });
      expect(shop.slug).toMatch(/^noi-that-go-viet-[0-9a-f]{6}$/);
      expect(mail.outbox.some((m) => m.to === r.email && m.subject.includes('Xác minh email'))).toBe(true);
      const stored = await prisma.system.user.findUniqueOrThrow({ where: { id: r.user.id } });
      expect(stored.passwordHash).toMatch(/^\$argon2id\$/);
    });

    it('rejects a duplicate email (case-insensitive)', async () => {
      const r = await register();
      const res = await api().post('/v1/auth/register').send({ fullName: 'Ai đó', email: r.email.toUpperCase(), password: PASSWORD, shopName: 'Shop 2', acceptTerms: true });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('EMAIL_TAKEN');
    });

    it('validates input and password rules', async () => {
      const weak = await api().post('/v1/auth/register').send({ fullName: 'Test', email: newEmail(), password: '12345678', shopName: 'Shop', acceptTerms: true });
      expect(weak.status).toBe(400);
      expect(weak.body.error.code).toBe('WEAK_PASSWORD');
      expect(weak.body.error.details).toContain('Có cả chữ và số');
      const noTerms = await api().post('/v1/auth/register').send({ fullName: 'Test', email: 'sai-email', password: PASSWORD, shopName: 'Shop' });
      expect(noTerms.status).toBe(400);
      expect(noTerms.body.error.code).toBe('VALIDATION_FAILED');
      expect(noTerms.body.error.details.map((d: { field: string }) => d.field).sort()).toEqual(['acceptTerms', 'email']);
    });
  });

  describe('AUTH-02 verify email', () => {
    it('verifies once; the link cannot be reused; resend answers the same for any email', async () => {
      const r = await register();
      const token = lastLink(r.email, 'verify');
      await api().post('/v1/auth/verify-email').send({ token }).expect(204);
      const me = await api().get('/v1/auth/me').set(bearer(r.accessToken)).expect(200);
      expect(me.body.user.emailVerifiedAt).not.toBeNull();
      expect(me.body.user.verifyDeadline).toBeNull();
      const again = await api().post('/v1/auth/verify-email').send({ token }).expect(400);
      expect(again.body.error.code).toBe('TOKEN_USED');
      const bogus = await api()
        .post('/v1/auth/verify-email')
        .send({ token: 'x'.repeat(43) })
        .expect(400);
      expect(bogus.body.error.code).toBe('TOKEN_INVALID');
      const a = await api().post('/v1/auth/resend-verification').send({ email: r.email }).expect(202);
      const b = await api().post('/v1/auth/resend-verification').send({ email: newEmail() }).expect(202);
      expect(a.body).toEqual(b.body);
    });

    it('blocks login after the 7-day grace period until the email is verified', async () => {
      const r = await register();
      await prisma.system.user.update({ where: { id: r.user.id }, data: { createdAt: new Date(Date.now() - 8 * 86_400_000) } });
      const res = await login(r.email);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('EMAIL_NOT_VERIFIED');
    });
  });

  describe('AUTH-03/04 login and token rotation', () => {
    it('logs in, calls a protected route, rejects missing or forged tokens', async () => {
      const r = await register();
      const res = await login(r.email.toUpperCase());
      expect(res.status).toBe(200);
      await api().get('/v1/auth/me').set(bearer(res.body.accessToken)).expect(200);
      expect((await api().get('/v1/auth/me')).body.error.code).toBe('UNAUTHORIZED');
      const forged = res.body.accessToken.slice(0, -4) + 'AAAA';
      expect((await api().get('/v1/auth/me').set(bearer(forged))).body.error.code).toBe('TOKEN_INVALID');
    });

    it('rotates the refresh token; reusing an old one revokes the whole session family', async () => {
      const r = await register();
      const first = await api().post('/v1/auth/refresh').send({ refreshToken: r.refreshToken }).expect(200);
      secrets.push(first.body.accessToken, first.body.refreshToken);
      expect(first.body.refreshToken).not.toBe(r.refreshToken);
      await api().get('/v1/auth/me').set(bearer(first.body.accessToken)).expect(200);

      // Attacker replays the stolen first token.
      const replay = await api().post('/v1/auth/refresh').send({ refreshToken: r.refreshToken }).expect(401);
      expect(replay.body.error.code).toBe('REFRESH_INVALID');
      // The legitimate holder of the newest token is logged out too, and the access token dies immediately.
      await api().post('/v1/auth/refresh').send({ refreshToken: first.body.refreshToken }).expect(401);
      expect((await api().get('/v1/auth/me').set(bearer(first.body.accessToken))).body.error.code).toBe('SESSION_REVOKED');
      const audit = await prisma.system.auditLog.findFirst({ where: { actorId: r.user.id, action: 'auth.refresh_reuse' } });
      expect(audit).not.toBeNull();
    });

    it('only one of two concurrent refreshes with the same token succeeds', async () => {
      const r = await register();
      const [a, b] = await Promise.all([api().post('/v1/auth/refresh').send({ refreshToken: r.refreshToken }), api().post('/v1/auth/refresh').send({ refreshToken: r.refreshToken })]);
      expect([a.status, b.status].sort()).toEqual([200, 401]);
    });

    it('answers login in under 500 ms (Argon2id cost)', async () => {
      const r = await register();
      const started = performance.now();
      expect((await login(r.email)).status).toBe(200);
      expect(performance.now() - started).toBeLessThan(500);
    });

    it('records successful and failed logins in the audit log with IP', async () => {
      const r = await register();
      await login(r.email, 'Sai-mat-khau-1');
      await login(r.email);
      const rows = await prisma.system.auditLog.findMany({ where: { actorId: r.user.id, action: { in: ['auth.login', 'auth.login_failed'] } } });
      expect(rows.map((x) => x.action).sort()).toEqual(['auth.login', 'auth.login_failed']);
      expect(rows.every((x) => x.ip)).toBe(true);
    });
  });

  describe('AUTH-03 lockout, CAPTCHA and uniform errors', () => {
    it('gives identical answers for unknown emails and wrong passwords', async () => {
      const r = await register();
      const known = await login(r.email, 'Sai-mat-khau-1');
      const unknown = await login(newEmail(), 'Sai-mat-khau-1');
      expect(known.status).toBe(401);
      expect(unknown.body).toEqual({ ...known.body, requestId: unknown.body.requestId });
    });

    it('requires CAPTCHA from the 3rd failure and locks for 15 minutes after the 5th, even with the right password', async () => {
      const r = await register();
      const codes: string[] = [];
      for (let i = 1; i <= 3; i++) codes.push((await login(r.email, `Sai-mat-khau-${i}`)).body.error.code);
      expect(codes).toEqual(['INVALID_CREDENTIALS', 'INVALID_CREDENTIALS', 'INVALID_CREDENTIALS']);
      const noCaptcha = await login(r.email, 'Sai-mat-khau-4');
      expect(noCaptcha.status).toBe(400);
      expect(noCaptcha.body.error.code).toBe('CAPTCHA_REQUIRED');
      const fourth = await login(r.email, 'Sai-mat-khau-4', { captcha: 'turnstile-token' });
      expect(fourth.body.error).toMatchObject({ code: 'INVALID_CREDENTIALS', details: { attemptsLeft: 1, captchaRequired: true } });
      const fifth = await login(r.email, 'Sai-mat-khau-5', { captcha: 'turnstile-token' });
      expect(fifth.status).toBe(423);
      const correct = await login(r.email, PASSWORD, { captcha: 'turnstile-token' });
      expect(correct.status).toBe(423);
      expect(correct.body.error.code).toBe('ACCOUNT_LOCKED');
      expect(correct.body.error.details.retryAfterSeconds).toBeGreaterThan(800);
    });

    it('locks unknown emails the same way (no account enumeration through the lock)', async () => {
      const ghost = newEmail();
      for (let i = 0; i < 5; i++) await login(ghost, 'Sai-mat-khau-1', { captcha: 'x' });
      expect((await login(ghost, 'Sai-mat-khau-1', { captcha: 'x' })).body.error.code).toBe('ACCOUNT_LOCKED');
    });
  });

  describe('AUTH-05 sessions', () => {
    it('lists devices, revokes one, logout and logout-all take effect immediately', async () => {
      const r = await register();
      const phone = (await login(r.email)).body;
      const list = await api().get('/v1/auth/sessions').set(bearer(phone.accessToken)).expect(200);
      expect(list.body).toHaveLength(2);
      expect(list.body.filter((s: { current: boolean }) => s.current)).toHaveLength(1);
      const other = list.body.find((s: { current: boolean }) => !s.current);
      await api().delete(`/v1/auth/sessions/${other.id}`).set(bearer(phone.accessToken)).expect(204);
      await api().get('/v1/auth/me').set(bearer(r.accessToken)).expect(401);
      await api().delete('/v1/auth/sessions/khong-ton-tai').set(bearer(phone.accessToken)).expect(404);

      await api().post('/v1/auth/logout').send({ refreshToken: phone.refreshToken }).expect(204);
      await api().get('/v1/auth/me').set(bearer(phone.accessToken)).expect(401);
      await api().post('/v1/auth/refresh').send({ refreshToken: phone.refreshToken }).expect(401);

      const a = (await login(r.email)).body;
      const b = (await login(r.email)).body;
      await api().post('/v1/auth/logout-all').set(bearer(a.accessToken)).expect(204);
      await api().get('/v1/auth/me').set(bearer(b.accessToken)).expect(401);
      await api().get('/v1/auth/me').set(bearer(a.accessToken)).expect(401);
    });

    it('logout-others keeps this device only', async () => {
      const r = await register();
      const other = (await login(r.email)).body;
      const res = await api().post('/v1/auth/logout-others').set(bearer(r.accessToken)).expect(200);
      expect(res.body.revoked).toBe(1);
      await api().get('/v1/auth/me').set(bearer(r.accessToken)).expect(200);
      await api().get('/v1/auth/me').set(bearer(other.accessToken)).expect(401);
    });

    it('updates the profile, rejects bad input, and lists own login history', async () => {
      const r = await register();
      await login(r.email, 'Sai-mat-khau-1');
      await login(r.email);
      const updated = await api().patch('/v1/auth/me').set(bearer(r.accessToken)).send({ fullName: 'Tên Mới', phone: '0901234567' }).expect(200);
      expect(updated.body.user).toMatchObject({ fullName: 'Tên Mới', phone: '0901234567' });
      await api().patch('/v1/auth/me').set(bearer(r.accessToken)).send({ phone: 'abc' }).expect(400);
      await api().patch('/v1/auth/me').set(bearer(r.accessToken)).send({ email: 'khac@example.vn' }).expect(400);
      const history = await api().get('/v1/auth/login-history').set(bearer(r.accessToken)).expect(200);
      expect(history.body.map((h: { ok: boolean }) => h.ok)).toEqual(expect.arrayContaining([true, false]));
      expect(history.body[0].ip).toBeTruthy();
      await api().get('/v1/auth/login-history').expect(401);
    });

    it('/me lists each shop with the permissions of that role', async () => {
      const r = await register();
      const me = await api().get('/v1/auth/me').set(bearer(r.accessToken)).expect(200);
      expect(me.body.shops[0]).toMatchObject({ role: 'ADMIN', isOwner: true });
      expect(me.body.shops[0].permissions).toEqual(expect.arrayContaining(['staff.manage', 'shop.owner']));
    });

    it('cannot revoke another user session', async () => {
      const victim = await register();
      const attacker = await register();
      const victimSessions = await api().get('/v1/auth/sessions').set(bearer(victim.accessToken)).expect(200);
      await api().delete(`/v1/auth/sessions/${victimSessions.body[0].id}`).set(bearer(attacker.accessToken)).expect(404);
      await api().get('/v1/auth/me').set(bearer(victim.accessToken)).expect(200);
    });
  });

  describe('web clients use an HttpOnly cookie for the refresh token', () => {
    it('sets, rotates and clears the cookie; never returns the token in the body', async () => {
      const r = await register();
      const res = await login(r.email, PASSWORD, { platform: 'WEB' });
      expect(res.status).toBe(200);
      expect(res.body.refreshToken).toBeUndefined();
      const cookie = ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith('omnibot_rt='))!;
      expect(cookie).toMatch(/HttpOnly/);
      expect(cookie).toMatch(/Secure/);
      expect(cookie).toMatch(/SameSite=Strict/);
      expect(cookie).toMatch(/Path=\/v1\/auth/);
      const pair = cookie.split(';')[0]!;
      secrets.push(pair.split('=')[1]!);
      const refreshed = await api().post('/v1/auth/refresh').set('Cookie', pair).expect(200);
      expect(refreshed.body.refreshToken).toBeUndefined();
      const next = ([] as string[])
        .concat(refreshed.headers['set-cookie'] ?? [])
        .find((c) => c.startsWith('omnibot_rt='))!
        .split(';')[0]!;
      expect(next).not.toBe(pair);
      const out = await api().post('/v1/auth/logout').set('Cookie', next).expect(204);
      expect(String(out.headers['set-cookie'])).toMatch(/omnibot_rt=;/);
      await api().post('/v1/auth/refresh').set('Cookie', next).expect(401);
    });
  });

  describe('AUTH-06 passwords', () => {
    it('forgot-password answers the same for unknown emails and only mails real accounts', async () => {
      const r = await register();
      const before = mail.outbox.length;
      const ghost = newEmail();
      const a = await api().post('/v1/auth/forgot-password').send({ email: r.email }).expect(202);
      const b = await api().post('/v1/auth/forgot-password').send({ email: ghost }).expect(202);
      expect(a.body).toEqual(b.body);
      await new Promise((ok) => setTimeout(ok, 300));
      const sent = mail.outbox.slice(before);
      expect(sent.some((m) => m.to === r.email && m.subject.includes('Đặt lại mật khẩu'))).toBe(true);
      expect(sent.some((m) => m.to === ghost)).toBe(false);
    });

    it('reset revokes every session, unlocks the account and the link works once', async () => {
      const r = await register();
      for (let i = 0; i < 5; i++) await login(r.email, 'Sai-mat-khau-1', { captcha: 'x' });
      expect((await login(r.email)).status).toBe(423);
      await api().post('/v1/auth/forgot-password').send({ email: r.email }).expect(202);
      await new Promise((ok) => setTimeout(ok, 300));
      const token = lastLink(r.email, 'reset');
      const weak = await api().post('/v1/auth/reset-password').send({ token, password: 'abc' }).expect(400);
      expect(weak.body.error.code).toBe('WEAK_PASSWORD');
      // A rejected password does not burn the link.
      const token2 = token;
      await api().post('/v1/auth/reset-password').send({ token: token2, password: NEW_PASSWORD }).expect(204);
      await api().get('/v1/auth/me').set(bearer(r.accessToken)).expect(401);
      expect((await api().post('/v1/auth/reset-password').send({ token: token2, password: NEW_PASSWORD })).body.error.code).toBe('TOKEN_USED');
      expect((await login(r.email)).status).toBe(401);
      expect((await login(r.email, NEW_PASSWORD)).status).toBe(200);
    });

    it('change-password keeps the current device and signs out the others', async () => {
      const r = await register();
      const other = (await login(r.email)).body;
      const wrong = await api().post('/v1/auth/change-password').set(bearer(r.accessToken)).send({ currentPassword: 'Khong-dung-1', newPassword: NEW_PASSWORD });
      expect(wrong.body.error.code).toBe('INVALID_PASSWORD');
      const same = await api().post('/v1/auth/change-password').set(bearer(r.accessToken)).send({ currentPassword: PASSWORD, newPassword: PASSWORD });
      expect(same.body.error.code).toBe('SAME_PASSWORD');
      await api().post('/v1/auth/change-password').set(bearer(r.accessToken)).send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD }).expect(204);
      await api().get('/v1/auth/me').set(bearer(r.accessToken)).expect(200);
      await api().get('/v1/auth/me').set(bearer(other.accessToken)).expect(401);
    });
  });

  describe('AUTH-13 account deletion', () => {
    it('signs out everywhere, can be cancelled by logging in again, and is purged after 30 days', async () => {
      const r = await register();
      expect((await api().post('/v1/auth/delete-account').set(bearer(r.accessToken)).send({ password: 'Khong-dung-1' })).body.error.code).toBe('INVALID_PASSWORD');
      const del = await api().post('/v1/auth/delete-account').set(bearer(r.accessToken)).send({ password: PASSWORD }).expect(202);
      expect(new Date(del.body.purgeAt).getTime()).toBeGreaterThan(Date.now() + 29 * 86_400_000);
      await api().get('/v1/auth/me').set(bearer(r.accessToken)).expect(401);

      const back = await login(r.email);
      expect(back.status).toBe(200);
      expect(back.body.user.status).toBe('PENDING_DELETION');
      const cancelled = await api().post('/v1/auth/cancel-deletion').set(bearer(back.body.accessToken)).expect(200);
      expect(cancelled.body.user).toMatchObject({ status: 'ACTIVE', deletionRequestedAt: null });

      await api().post('/v1/auth/delete-account').set(bearer(back.body.accessToken)).send({ password: PASSWORD }).expect(202);
      const purge = app.get(AccountPurgeService);
      expect((await purge.run(new Date(Date.now() + 29 * 86_400_000))).purged).toBe(0);
      await purge.run(new Date(Date.now() + 31 * 86_400_000));
      const gone = await prisma.system.user.findUniqueOrThrow({ where: { id: r.user.id } });
      expect(gone).toMatchObject({ status: 'DELETED', fullName: 'Người dùng đã xóa', phone: null, passwordHash: '' });
      expect(gone.email).not.toContain(r.email);
      expect((await prisma.system.shop.findFirstOrThrow({ where: { ownerId: r.user.id } })).deletedAt).not.toBeNull();
      expect((await login(r.email)).status).toBe(401);
    });

    it('an owner with staff must transfer ownership first', async () => {
      const owner = await register();
      const staff = await register();
      const shop = await prisma.system.shop.findFirstOrThrow({ where: { ownerId: owner.user.id } });
      await prisma.system.shopMember.create({ data: { shopId: shop.id, userId: staff.user.id, role: 'SALE', status: 'ACTIVE' } });
      const res = await api().post('/v1/auth/delete-account').set(bearer(owner.accessToken)).send({ password: PASSWORD }).expect(409);
      expect(res.body.error.code).toBe('OWNER_MUST_TRANSFER');
    });
  });

  it('never writes passwords or tokens to the logs', () => {
    const logs = logger.lines.join('\n');
    expect(logger.lines.length).toBeGreaterThan(20);
    for (const secret of secrets.filter(Boolean)) expect(logs).not.toContain(secret);
  });
});
