// Authentication flows: AUTH-01 register, 02 verify email, 03 login + lockout + CAPTCHA, 04 refresh rotation,
// 05 sessions, 06 forgot/reset/change password, 13 account deletion, 17 login audit.
// Users, sessions and tokens are platform-level (not shop-owned), so this service uses PrismaService.system.
import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { apiError } from '../common/api-error.js';
import type { Env } from '../config/env.js';
import { AuditService } from '../core/audit.service.js';
import { PrismaService } from '../core/prisma.service.js';
import type { TokenPurpose, User } from '../generated/prisma/client.js';
import { MailService } from '../mail/mail.service.js';
import { type Permission, PERMISSIONS, roleHas } from '../shop/permissions.js';
import { templates } from '../mail/templates.js';
import { AccessTokenService } from './access-token.service.js';
import { CaptchaService } from './captcha.service.js';
import { CAPTCHA_AFTER, LoginAttemptsService, MAX_FAILED } from './login-attempts.service.js';
import { burnPasswordCheck, hashPassword, passwordIssues, verifyPassword } from './password.js';
import { type ClientMeta, type IssuedRefresh, SessionService } from './session.service.js';
import { hashToken, normalizeEmail, randomToken } from './tokens.js';

const DAY = 86_400_000;
export const VERIFY_GRACE_DAYS = 7;
export const DELETE_AFTER_DAYS = 30;
const TOKEN_TTL: Record<TokenPurpose, number> = { EMAIL_VERIFY: DAY, PASSWORD_RESET: 30 * 60_000 };

export interface RequestMeta {
  ip?: string;
  userAgent?: string;
}

export function slugify(name: string): string {
  const base = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  return `${base || 'shop'}-${randomBytes(3).toString('hex')}`;
}

const isUniqueViolation = (err: unknown) => (err as { code?: string })?.code === 'P2002';

@Injectable()
export class AuthService {
  private readonly tokenSecret: string;
  private readonly appUrl: string;

  constructor(
    config: ConfigService<Env, true>,
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly accessTokens: AccessTokenService,
    private readonly attempts: LoginAttemptsService,
    private readonly captcha: CaptchaService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
  ) {
    this.tokenSecret = config.get('JWT_REFRESH_SECRET', { infer: true });
    this.appUrl = config.get('APP_URL', { infer: true }).replace(/\/$/, '');
  }

  // ---------- views ----------

  publicUser(u: User) {
    return {
      id: u.id,
      email: u.email,
      fullName: u.fullName,
      phone: u.phone,
      avatarUrl: u.avatarUrl,
      status: u.status,
      emailVerifiedAt: u.emailVerifiedAt,
      verifyDeadline: u.emailVerifiedAt ? null : new Date(u.createdAt.getTime() + VERIFY_GRACE_DAYS * DAY),
      deletionRequestedAt: u.deletionRequestedAt,
      purgeAt: u.deletionRequestedAt ? new Date(u.deletionRequestedAt.getTime() + DELETE_AFTER_DAYS * DAY) : null,
    };
  }

  private async shopsOf(userId: string) {
    const members = await this.prisma.system.shopMember.findMany({
      where: { userId, status: 'ACTIVE', shop: { deletedAt: null } },
      include: { shop: { select: { id: true, name: true, slug: true, ownerId: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return members.map(({ shop: { ownerId, ...shop }, role }) => {
      const isOwner = ownerId === userId;
      // Lets clients show the right menus; the API still checks every request.
      const permissions = (Object.keys(PERMISSIONS) as Permission[]).filter((p) => roleHas(role, p) && (p !== 'shop.owner' || isOwner));
      return { ...shop, role, isOwner, permissions };
    });
  }

  async me(userId: string) {
    const user = await this.prisma.system.user.findUniqueOrThrow({ where: { id: userId } });
    return { user: this.publicUser(user), shops: await this.shopsOf(userId) };
  }

  private async issue(user: User, refresh: IssuedRefresh) {
    const access = await this.accessTokens.sign({ sub: user.id, sid: refresh.familyId });
    return {
      accessToken: access.token,
      accessTokenExpiresAt: access.expiresAt,
      refreshToken: refresh.refreshToken,
      refreshTokenExpiresAt: refresh.expiresAt,
      user: this.publicUser(user),
      shops: await this.shopsOf(user.id),
    };
  }

  // ---------- one-time tokens (verify email, reset password) ----------

  private async issueToken(userId: string, purpose: TokenPurpose): Promise<string> {
    const token = randomToken();
    // A new link invalidates the previous ones of the same kind.
    await this.prisma.system.verificationToken.updateMany({ where: { userId, purpose, usedAt: null }, data: { usedAt: new Date() } });
    await this.prisma.system.verificationToken.create({
      data: { userId, purpose, tokenHash: hashToken(this.tokenSecret, token), expiresAt: new Date(Date.now() + TOKEN_TTL[purpose]) },
    });
    return token;
  }

  /** Validates a one-time link and marks it used. `check` runs before consuming, so a rejected input keeps the link valid. */
  private async consumeToken(purpose: TokenPurpose, token: string, check?: (user: User) => void) {
    const row = await this.prisma.system.verificationToken.findUnique({ where: { tokenHash: hashToken(this.tokenSecret, token) }, include: { user: true } });
    if (!row || row.purpose !== purpose || row.user.status === 'DELETED') throw apiError(400, 'TOKEN_INVALID', 'Liên kết không hợp lệ.');
    if (row.usedAt) throw apiError(400, 'TOKEN_USED', 'Liên kết đã được sử dụng. Vui lòng yêu cầu liên kết mới.');
    if (row.expiresAt <= new Date()) throw apiError(400, 'TOKEN_EXPIRED', 'Liên kết đã hết hạn. Vui lòng yêu cầu liên kết mới.');
    check?.(row.user);
    const claimed = await this.prisma.system.verificationToken.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
    if (claimed.count === 0) throw apiError(400, 'TOKEN_USED', 'Liên kết đã được sử dụng. Vui lòng yêu cầu liên kết mới.');
    return row.user;
  }

  private sendVerifyEmail(user: Pick<User, 'id' | 'email' | 'fullName'>, token: string) {
    this.mail.send(user.email, templates.verifyEmail(user.fullName, `${this.appUrl}/#/verify?token=${token}`));
  }

  private assertPassword(password: string, email: string) {
    const issues = passwordIssues(password, email);
    if (issues.length) throw apiError(400, 'WEAK_PASSWORD', `Mật khẩu chưa đạt: ${issues.join(', ')}.`, issues);
  }

  // ---------- AUTH-01 register ----------

  async register(input: { fullName: string; email: string; password: string; shopName: string; field?: string; phone?: string }, client: ClientMeta) {
    const email = normalizeEmail(input.email);
    this.assertPassword(input.password, email);
    const conflict = () => apiError(409, 'EMAIL_TAKEN', 'Email này đã được đăng ký. Hãy đăng nhập hoặc dùng "Quên mật khẩu".');
    if (await this.prisma.system.user.findUnique({ where: { email }, select: { id: true } })) throw conflict();
    const passwordHash = await hashPassword(input.password);
    let user: User;
    try {
      user = await this.prisma.system.$transaction(async (tx) => {
        const created = await tx.user.create({ data: { email, passwordHash, fullName: input.fullName, phone: input.phone } });
        const shop = await tx.shop.create({ data: { name: input.shopName, slug: slugify(input.shopName), field: input.field, hotline: input.phone, ownerId: created.id } });
        await tx.shopMember.create({ data: { shopId: shop.id, userId: created.id, role: 'ADMIN', status: 'ACTIVE' } });
        return created;
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw conflict();
      throw err;
    }
    this.sendVerifyEmail(user, await this.issueToken(user.id, 'EMAIL_VERIFY'));
    const refresh = await this.sessions.create(user.id, client);
    await this.audit.log({ action: 'auth.register', actorId: user.id, entityType: 'User', entityId: user.id, ip: client.ip, userAgent: client.userAgent });
    return this.issue(user, refresh);
  }

  // ---------- AUTH-03 login ----------

  async login(input: { email: string; password: string; captcha?: string }, client: ClientMeta) {
    const email = normalizeEmail(input.email);
    const state = await this.attempts.state(email);
    if (state.lockedMs > 0) {
      const minutes = Math.ceil(state.lockedMs / 60_000);
      throw apiError(423, 'ACCOUNT_LOCKED', `Tài khoản tạm khóa do nhập sai nhiều lần. Thử lại sau ${minutes} phút hoặc đặt lại mật khẩu.`, { retryAfterSeconds: Math.ceil(state.lockedMs / 1000) });
    }
    if (state.failures >= CAPTCHA_AFTER && !(await this.captcha.verify(input.captcha, client.ip))) {
      throw apiError(400, 'CAPTCHA_REQUIRED', 'Vui lòng xác nhận bạn không phải người máy.', { captchaRequired: true });
    }

    const user = await this.prisma.system.user.findUnique({ where: { email } });
    const valid = user && user.status !== 'DELETED' ? await verifyPassword(user.passwordHash, input.password) : (await burnPasswordCheck(input.password), false);
    if (!user || !valid) {
      const after = await this.attempts.recordFailure(email);
      await this.audit.log({
        action: 'auth.login_failed',
        actorId: user?.id ?? null,
        entityType: 'User',
        entityId: user?.id,
        data: { reason: user ? 'wrong_password' : 'unknown_email' },
        ip: client.ip,
        userAgent: client.userAgent,
      });
      if (after.lockedMs > 0) throw apiError(423, 'ACCOUNT_LOCKED', `Sai mật khẩu ${MAX_FAILED} lần. Tài khoản tạm khóa 15 phút.`, { retryAfterSeconds: Math.ceil(after.lockedMs / 1000) });
      const left = Math.max(MAX_FAILED - after.failures, 0);
      throw apiError(401, 'INVALID_CREDENTIALS', `Email hoặc mật khẩu không đúng.${left <= 2 ? ` Còn ${left} lần thử trước khi bị khóa tạm.` : ''}`, {
        attemptsLeft: left,
        captchaRequired: after.failures >= CAPTCHA_AFTER,
      });
    }
    // Status-specific answers only after a correct password, so they reveal nothing to an attacker.
    if (user.status === 'LOCKED') throw apiError(403, 'ACCOUNT_DISABLED', 'Tài khoản đã bị khóa. Vui lòng liên hệ quản trị viên.');
    if (!user.emailVerifiedAt && Date.now() > user.createdAt.getTime() + VERIFY_GRACE_DAYS * DAY) {
      throw apiError(403, 'EMAIL_NOT_VERIFIED', `Đã hết ${VERIFY_GRACE_DAYS} ngày dùng thử. Vui lòng xác minh email (kiểm tra hộp thư hoặc gửi lại liên kết).`);
    }

    await this.attempts.reset(email);
    if (await this.sessions.isNewDevice(user.id, client)) {
      this.mail.send(user.email, templates.newDevice(user.fullName, client.deviceName || client.userAgent || client.platform, client.ip ?? 'không rõ', new Date()));
    }
    const refresh = await this.sessions.create(user.id, client);
    const updated = await this.prisma.system.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date(), failedLoginCount: 0, lockedUntil: null } });
    await this.audit.log({
      action: 'auth.login',
      actorId: user.id,
      entityType: 'Session',
      entityId: refresh.familyId,
      data: { platform: client.platform },
      ip: client.ip,
      userAgent: client.userAgent,
    });
    return this.issue(updated, refresh);
  }

  // ---------- AUTH-04 refresh ----------

  async refresh(refreshToken: string, meta: RequestMeta) {
    const next = await this.sessions.rotate(refreshToken, meta);
    const user = await this.prisma.system.user.findUniqueOrThrow({ where: { id: next.userId } });
    return this.issue(user, next);
  }

  // ---------- AUTH-05 logout & sessions ----------

  async logout(refreshToken: string | undefined, meta: RequestMeta) {
    if (!refreshToken) return;
    const row = await this.prisma.system.session.findUnique({ where: { refreshTokenHash: this.sessions.hash(refreshToken) }, select: { userId: true, familyId: true } });
    if (!row) return;
    await this.sessions.revokeFamily(row.familyId, 'logout');
    await this.audit.log({ action: 'auth.logout', actorId: row.userId, entityType: 'Session', entityId: row.familyId, ip: meta.ip, userAgent: meta.userAgent });
  }

  async logoutAll(userId: string, meta: RequestMeta) {
    const count = await this.sessions.revokeAll(userId, 'logout_all');
    await this.audit.log({ action: 'auth.logout_all', actorId: userId, data: { sessions: count }, ip: meta.ip, userAgent: meta.userAgent });
  }

  listSessions(userId: string, familyId: string) {
    return this.sessions.list(userId, familyId);
  }

  async revokeSession(userId: string, familyId: string, meta: RequestMeta) {
    if (!(await this.sessions.revokeFamily(familyId, 'revoked_by_user', userId))) throw apiError(404, 'SESSION_NOT_FOUND', 'Không tìm thấy phiên đăng nhập này.');
    await this.audit.log({ action: 'auth.session_revoked', actorId: userId, entityType: 'Session', entityId: familyId, ip: meta.ip, userAgent: meta.userAgent });
  }

  async logoutOthers(userId: string, familyId: string, meta: RequestMeta) {
    const count = await this.sessions.revokeAll(userId, 'logout_all', familyId);
    await this.audit.log({ action: 'auth.logout_others', actorId: userId, data: { sessions: count }, ip: meta.ip, userAgent: meta.userAgent });
    return { revoked: count };
  }

  // ---------- profile & login history ----------

  async updateProfile(userId: string, data: { fullName?: string; phone?: string | null }) {
    await this.prisma.system.user.update({ where: { id: userId }, data });
    return this.me(userId);
  }

  async loginHistory(userId: string) {
    const rows = await this.prisma.system.auditLog.findMany({
      where: { actorId: userId, action: { in: ['auth.register', 'auth.login', 'auth.login_failed'] } },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: { id: true, action: true, ip: true, userAgent: true, createdAt: true },
    });
    return rows.map(({ action, ...r }) => ({ ...r, ok: action !== 'auth.login_failed', action }));
  }

  // ---------- AUTH-02 verify email ----------

  async verifyEmail(token: string, meta: RequestMeta) {
    const user = await this.consumeToken('EMAIL_VERIFY', token);
    if (!user.emailVerifiedAt) await this.prisma.system.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });
    await this.audit.log({ action: 'auth.email_verified', actorId: user.id, entityType: 'User', entityId: user.id, ip: meta.ip, userAgent: meta.userAgent });
  }

  /** Same answer whether or not the email exists / is already verified. */
  async resendVerification(email: string) {
    const user = await this.prisma.system.user.findUnique({ where: { email: normalizeEmail(email) } });
    if (!user || user.emailVerifiedAt || user.status === 'DELETED') return;
    this.sendVerifyEmail(user, await this.issueToken(user.id, 'EMAIL_VERIFY'));
  }

  // ---------- AUTH-06 passwords ----------

  /** Same answer whether or not the email exists. */
  async forgotPassword(email: string) {
    const user = await this.prisma.system.user.findUnique({ where: { email: normalizeEmail(email) } });
    if (!user || user.status === 'DELETED' || user.status === 'LOCKED') return;
    const token = await this.issueToken(user.id, 'PASSWORD_RESET');
    this.mail.send(user.email, templates.resetPassword(user.fullName, `${this.appUrl}/#/reset?token=${token}`));
  }

  async resetPassword(token: string, password: string, meta: RequestMeta) {
    const user = await this.consumeToken('PASSWORD_RESET', token, (u) => this.assertPassword(password, u.email));
    // The reset link proves the user owns the mailbox → also counts as email verification.
    await this.prisma.system.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(password), emailVerifiedAt: user.emailVerifiedAt ?? new Date(), failedLoginCount: 0, lockedUntil: null },
    });
    await this.sessions.revokeAll(user.id, 'password_reset');
    await this.attempts.reset(user.email);
    this.mail.send(user.email, templates.passwordChanged(user.fullName));
    await this.audit.log({ action: 'auth.password_reset', actorId: user.id, entityType: 'User', entityId: user.id, ip: meta.ip, userAgent: meta.userAgent });
  }

  async changePassword(userId: string, familyId: string, current: string, next: string, meta: RequestMeta) {
    const user = await this.prisma.system.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await verifyPassword(user.passwordHash, current))) throw apiError(400, 'INVALID_PASSWORD', 'Mật khẩu hiện tại không đúng.');
    if (current === next) throw apiError(400, 'SAME_PASSWORD', 'Mật khẩu mới phải khác mật khẩu hiện tại.');
    this.assertPassword(next, user.email);
    await this.prisma.system.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(next) } });
    const revoked = await this.sessions.revokeAll(userId, 'password_changed', familyId);
    this.mail.send(user.email, templates.passwordChanged(user.fullName));
    await this.audit.log({ action: 'auth.password_changed', actorId: userId, entityType: 'User', entityId: userId, data: { otherSessionsRevoked: revoked }, ip: meta.ip, userAgent: meta.userAgent });
  }

  // ---------- AUTH-13 account deletion ----------

  async requestDeletion(userId: string, password: string, meta: RequestMeta) {
    const user = await this.prisma.system.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await verifyPassword(user.passwordHash, password))) throw apiError(400, 'INVALID_PASSWORD', 'Mật khẩu không đúng.');
    if (user.status === 'PENDING_DELETION') throw apiError(409, 'DELETION_PENDING', 'Tài khoản đã có yêu cầu xóa.');
    // An owner cannot leave staff without an owner: transfer ownership first (Step 3) or remove the staff.
    const blocking = await this.prisma.system.shop.findMany({
      where: { ownerId: userId, deletedAt: null, members: { some: { userId: { not: userId }, status: { in: ['ACTIVE', 'INVITED'] } } } },
      select: { id: true, name: true },
    });
    if (blocking.length) {
      throw apiError(409, 'OWNER_MUST_TRANSFER', `Bạn đang là chủ cửa hàng ${blocking.map((s) => `"${s.name}"`).join(', ')} có nhân viên. Hãy chuyển quyền chủ sở hữu trước khi xóa tài khoản.`, {
        shops: blocking,
      });
    }
    const now = new Date();
    await this.prisma.system.user.update({ where: { id: userId }, data: { status: 'PENDING_DELETION', deletionRequestedAt: now } });
    await this.sessions.revokeAll(userId, 'account_deletion');
    const purgeAt = new Date(now.getTime() + DELETE_AFTER_DAYS * DAY);
    this.mail.send(user.email, templates.deletionRequested(user.fullName, purgeAt));
    await this.audit.log({
      action: 'auth.deletion_requested',
      actorId: userId,
      entityType: 'User',
      entityId: userId,
      data: { purgeAt: purgeAt.toISOString() },
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return { purgeAt };
  }

  async cancelDeletion(userId: string, meta: RequestMeta) {
    const res = await this.prisma.system.user.updateMany({ where: { id: userId, status: 'PENDING_DELETION' }, data: { status: 'ACTIVE', deletionRequestedAt: null } });
    if (res.count === 0) throw apiError(409, 'NO_PENDING_DELETION', 'Tài khoản không có yêu cầu xóa.');
    await this.audit.log({ action: 'auth.deletion_cancelled', actorId: userId, entityType: 'User', entityId: userId, ip: meta.ip, userAgent: meta.userAgent });
    return this.me(userId);
  }
}
