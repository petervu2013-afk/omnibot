// Refresh-token sessions (AUTH-04, AUTH-05).
// One login = one session *family* (familyId). Each refresh rotates the token: the used row is marked
// revokeReason='rotated' and a new row joins the family. Presenting a rotated token again means it was copied
// → the whole family is revoked (reuse detection). Users see/revoke families ("devices"), identified by familyId.
import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { apiError } from '../common/api-error.js';
import { durationMs, type Env } from '../config/env.js';
import { AuditService } from '../core/audit.service.js';
import { PrismaService } from '../core/prisma.service.js';
import type { ClientPlatform } from '../generated/prisma/client.js';
import { hashToken, randomToken } from './tokens.js';

export interface ClientMeta {
  platform: ClientPlatform;
  deviceName?: string;
  ip?: string;
  userAgent?: string;
}

export interface IssuedRefresh {
  familyId: string;
  refreshToken: string;
  expiresAt: Date;
}

export type RevokeReason = 'rotated' | 'logout' | 'logout_all' | 'revoked_by_user' | 'reuse_detected' | 'password_changed' | 'password_reset' | 'account_deletion' | 'account_locked';

@Injectable()
export class SessionService {
  private readonly secret: string;
  private readonly ttlMs: number;

  constructor(
    config: ConfigService<Env, true>,
    // Sessions are platform-level (not shop-owned): the unguarded client is intended here.
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {
    this.secret = config.get('JWT_REFRESH_SECRET', { infer: true });
    this.ttlMs = durationMs(config.get('JWT_REFRESH_TTL', { infer: true }));
  }

  hash(token: string) {
    return hashToken(this.secret, token);
  }

  async create(userId: string, meta: ClientMeta, familyId: string = randomUUID()): Promise<IssuedRefresh> {
    const refreshToken = randomToken();
    const expiresAt = new Date(Date.now() + this.ttlMs);
    await this.prisma.system.session.create({
      data: {
        userId,
        familyId,
        refreshTokenHash: this.hash(refreshToken),
        platform: meta.platform,
        deviceName: meta.deviceName?.slice(0, 100),
        ip: meta.ip,
        userAgent: meta.userAgent?.slice(0, 500),
        expiresAt,
      },
    });
    return { familyId, refreshToken, expiresAt };
  }

  async rotate(refreshToken: string, meta: Pick<ClientMeta, 'ip' | 'userAgent'>): Promise<IssuedRefresh & { userId: string }> {
    const invalid = () => apiError(401, 'REFRESH_INVALID', 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại.');
    const row = await this.prisma.system.session.findUnique({
      where: { refreshTokenHash: this.hash(refreshToken) },
      include: { user: { select: { status: true } } },
    });
    if (!row) throw invalid();
    if (row.revokedAt) {
      if (row.revokeReason === 'rotated') await this.reuseDetected(row.userId, row.familyId, meta);
      throw invalid();
    }
    if (row.expiresAt <= new Date() || row.user.status === 'LOCKED' || row.user.status === 'DELETED') throw invalid();

    // Claim the row atomically: of two concurrent refreshes with the same token only one wins.
    const claimed = await this.prisma.system.session.updateMany({
      where: { id: row.id, revokedAt: null },
      data: { revokedAt: new Date(), revokeReason: 'rotated' },
    });
    if (claimed.count === 0) {
      await this.reuseDetected(row.userId, row.familyId, meta);
      throw invalid();
    }
    const next = await this.create(
      row.userId,
      { platform: row.platform, deviceName: row.deviceName ?? undefined, ip: meta.ip ?? row.ip ?? undefined, userAgent: meta.userAgent ?? row.userAgent ?? undefined },
      row.familyId,
    );
    if (row.pushToken) await this.prisma.system.session.update({ where: { refreshTokenHash: this.hash(next.refreshToken) }, data: { pushToken: row.pushToken } });
    return { ...next, userId: row.userId };
  }

  private async reuseDetected(userId: string, familyId: string, meta: Pick<ClientMeta, 'ip' | 'userAgent'>) {
    await this.revokeFamily(familyId, 'reuse_detected');
    await this.audit.log({ action: 'auth.refresh_reuse', actorId: userId, entityType: 'Session', entityId: familyId, ip: meta.ip, userAgent: meta.userAgent });
  }

  /** Revokes one device (family). Returns false when the family does not belong to the user / is already revoked. */
  async revokeFamily(familyId: string, reason: RevokeReason, userId?: string): Promise<boolean> {
    const res = await this.prisma.system.session.updateMany({
      where: { familyId, revokedAt: null, ...(userId ? { userId } : {}) },
      data: { revokedAt: new Date(), revokeReason: reason },
    });
    return res.count > 0;
  }

  async revokeAll(userId: string, reason: RevokeReason, exceptFamilyId?: string): Promise<number> {
    const res = await this.prisma.system.session.updateMany({
      where: { userId, revokedAt: null, ...(exceptFamilyId ? { familyId: { not: exceptFamilyId } } : {}) },
      data: { revokedAt: new Date(), revokeReason: reason },
    });
    return res.count;
  }

  async isActive(userId: string, familyId: string): Promise<boolean> {
    const row = await this.prisma.system.session.findFirst({
      where: { userId, familyId, revokedAt: null, expiresAt: { gt: new Date() }, user: { status: { in: ['ACTIVE', 'PENDING_DELETION'] } } },
      select: { id: true },
    });
    return row !== null;
  }

  async list(userId: string, currentFamilyId: string) {
    const rows = await this.prisma.system.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => ({
      id: r.familyId,
      platform: r.platform,
      deviceName: r.deviceName,
      userAgent: r.userAgent,
      ip: r.ip,
      lastUsedAt: r.createdAt, // a row is created on every refresh
      expiresAt: r.expiresAt,
      current: r.familyId === currentFamilyId,
    }));
  }

  /** True if this user has signed in before but never from this browser/app. */
  async isNewDevice(userId: string, meta: ClientMeta): Promise<boolean> {
    const [any, same] = await Promise.all([
      this.prisma.system.session.count({ where: { userId } }),
      this.prisma.system.session.count({ where: { userId, platform: meta.platform, userAgent: meta.userAgent?.slice(0, 500) ?? null } }),
    ]);
    return any > 0 && same === 0;
  }
}
